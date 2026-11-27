import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { walkthroughs } from "../src/walkthroughs.mjs";

const [skillDir, workDir, action, ...selected] = process.argv.slice(2);
if (!skillDir || !workDir || !["prepare", "narrate", "screen", "export"].includes(action) ||
    selected.some((slug) => !Object.hasOwn(walkthroughs, slug))) {
  throw new Error("Usage: node scripts/build_walkthroughs.mjs RECORD_DEMO_DIR WORK_DIR prepare|narrate|screen|export [LESSON ...]");
}

const assets = fileURLToPath(new URL("../src/media/", import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);

function skill(script, directory, ...args) {
  execFileSync("uv", ["run", "--python", "3.12", resolve(skillDir, "scripts", script), directory, ...args], {
    stdio: "inherit",
    env: { ...process.env, DEMO_TTS_BACKEND: "onnx", DEMO_FFMPEG_PRESET: process.env.DEMO_FFMPEG_PRESET ?? "veryfast" },
  });
}

const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function slide(walkthrough, stage) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(stage.title)}</title><style>
    * { box-sizing: border-box }
    body { margin: 0; background: #142326; color: #effaf3; font: 24px system-ui, sans-serif; }
    main { padding: 26px 52px; }
    header { color: #b7d9ce; font-weight: 650; font-size: 21px; padding-bottom: 12px; border-bottom: 1px solid #49615c; }
    h1 { font-size: 38px; line-height: 1.15; margin: 19px 0; letter-spacing: -.02em; }
    ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
    li { padding: 8px 16px; background: #24393b; border-left: 3px solid #729c93; border-radius: 4px; }
    li:last-child { background: #28473e; border-color: #a3ddc2; }
  </style><main><header>${escape(walkthrough.title)}</header>
  <h1>${escape(stage.title)}</h1>
  <ol>${stage.diagram.map((line) => `<li>${escape(line)}</li>`).join("")}</ol></main></html>`;
}

const recordings = Object.entries(walkthroughs)
  .filter(([slug]) => selected.length === 0 || selected.includes(slug))
  .map(([slug, walkthrough]) => ({
    slug, walkthrough, directory: resolve(workDir, slug),
    scenes: walkthrough.stages.map((stage, index) => ({
      id: `s${index + 1}`, slide: index + 1, step: stage.title, text: stage.narration,
      ...(stage.speech ? { say: stage.speech } : {}),
      ...(stage.narration.endsWith("?") ? { hold: 3 } : {}),
    })),
  }));

function ffmpeg(...args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}

function inspect(path, entries) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "json", path], {
    encoding: "utf8",
  }));
}

const formatScenes = (scenes) => JSON.stringify(scenes, null, 2) + "\n";

function browserCaptions(srt) {
  const milliseconds = (clock) => clock.split(/[:,]/).map(Number)
    .reduce((total, part, index) => total * (index === 3 ? 1000 : 60) + part, 0);
  const clock = (stamp) => new Date(Math.round(stamp)).toISOString().slice(11, 23);
  const cues = srt.trim().split(/\r?\n\r?\n/).flatMap((block) => {
    const [, timing, ...text] = block.split(/\r?\n/);
    const [start, end] = timing.split(" --> ").map(milliseconds);
    const words = text.join(" ").split(/\s+/);
    const groups = [];
    let line = "";
    for (const word of words) {
      if (line && line.length + word.length + 1 > 42) {
        groups.push(line);
        line = "";
      }
      line += line ? " " + word : word;
    }
    groups.push(line);
    let elapsed = start;
    return groups.map((group) => {
      const next = elapsed + (end - start) * group.split(" ").length / words.length;
      const cue = `${clock(elapsed)} --> ${clock(next)}\n${escape(group)}`;
      elapsed = next;
      return cue;
    });
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

if (action === "prepare") {
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 4 });
    for (const { directory, walkthrough, scenes } of recordings) {
      const slides = join(directory, "slides");
      await mkdir(slides, { recursive: true });
      await writeFile(join(directory, "scenes.json"), formatScenes(scenes));
      for (const [index, stage] of walkthrough.stages.entries()) {
        await page.setContent(slide(walkthrough, stage));
        const content = await page.locator("ol").boundingBox();
        if (content.y + content.height > 410) throw new Error(`Caption area is obstructed on "${stage.title}".`);
        const image = join(slides, `s-${index + 1}.png`);
        await page.screenshot({ path: image });
        const [frame] = inspect(image, "stream=width,height").streams;
        if (frame.width !== 3840 || frame.height !== 2160) throw new Error(`Expected native 4K slide: ${image}`);
      }
    }
  } finally {
    await browser.close();
  }
} else {
  for (const { slug, directory, scenes, walkthrough } of recordings) {
    if (await readFile(join(directory, "scenes.json"), "utf8") !== formatScenes(scenes)) {
      throw new Error(`Run prepare to refresh the script for ${slug}.`);
    }
    switch (action) {
      case "narrate":
        skill("tts.py", directory, "af_heart", "1.0");
        break;
      case "screen":
        skill("phonemes.py", directory, "--all");
        skill("asr.py", directory, "small.en");
        break;
      case "export": {
        skill("deck.py", directory, slug, walkthrough.title);
        const video = join(directory, "out", `${slug}-4k-narrated.mp4`);
        const srt = join(directory, "out", `${slug}.srt`);
        const [picture, sound, captions] = inspect(video, "stream=codec_name,width,height,r_frame_rate").streams;
        if (picture.codec_name !== "h264" || picture.width !== 3840 || picture.height !== 2160 ||
            picture.r_frame_rate !== "30/1" || sound?.codec_name !== "aac" || captions?.codec_name !== "mov_text") {
          throw new Error(`Unexpected export streams: ${video}`);
        }
        ffmpeg("-xerror", "-threads", "2", "-i", video, "-map", "0:v", "-map", "0:a", "-f", "null", "-");
        await writeFile(join(directory, "out", "captions.vtt"), browserCaptions(await readFile(srt, "utf8")));
        ffmpeg("-i", join(directory, "slides", "s-1.png"), "-vf", "scale=960:540", "-frames:v", "1",
          join(directory, "out", "poster.webp"));
        break;
      }
    }
  }
  if (action === "export") {
    for (const { slug, directory } of recordings) {
      const out = join(directory, "out");
      const destination = join(assets, slug);
      await mkdir(destination, { recursive: true });
      await copyFile(join(out, `${slug}-4k-narrated.mp4`), join(destination, "walkthrough.mp4"));
      await copyFile(join(out, "captions.vtt"), join(destination, "captions.vtt"));
      await copyFile(join(out, "poster.webp"), join(destination, "poster.webp"));
    }
  }
}
