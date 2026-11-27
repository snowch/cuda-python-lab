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
function traceSlide(walkthrough, stage) {
  const { step, host, device, transfer, block, write, result } = stage.trace;
  const line = (id, source) => `<code class="${step === id ? "active" : ""}">${escape(source)}</code>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(stage.title)}</title><style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #142326; color: #effaf3; font: 20px system-ui, sans-serif; }
    main { padding: 16px 34px; }
    header { color: #b7d9ce; font-weight: 650; }
    h1 { font-size: 30px; line-height: 1.1; margin: 4px 0 10px; }
    h2 { font-size: 20px; margin: 0 0 4px; }
    h3 { font-size: 17px; margin: 0 0 5px; }
    code { font: 17px/1.17 monospace; }
    .trace { display: grid; grid-template-columns: 374px 1fr; gap: 20px; }
    .program, .cpu, .gpu { background: #1c3034; border: 1px solid #527071; padding: 8px; border-radius: 8px; }
    .program code { display: block; white-space: pre; padding: 0 7px; border-left: 4px solid transparent; }
    .program .active { background: #365340; border-color: #b5ed8d; }
    .program h2 + code { margin-top: 2px; }
    .program .kernel { margin-top: 7px; }
    .hardware { display: grid; grid-template-columns: 182px 102px 1fr; align-items: stretch; }
    .arrow { align-self: center; text-align: center; font-size: 17px; font-weight: 700; color: #b5ed8d; }
    .memory code { display: block; font-size: 16px; white-space: nowrap; }
    .memory, .sm { border: 1px solid #527071; padding: 7px; background: #142326; border-radius: 5px; }
    .sm { margin-bottom: 8px; }
    .thread { display: grid; align-items: center; min-height: 38px; padding: 2px 7px; background: #294248; font-size: 16px; }
    .hot { border-color: #b5ed8d; background: #365340; }
    .thread strong { color: #b5ed8d; }
    .empty { visibility: hidden; }
  </style><main><header>${escape(walkthrough.title)}</header>
  <h1>${escape(stage.title)}</h1>
  <div class="trace">
    <section class="program">
      <h2>Host code · main()</h2>
      ${line("upload", "out = cuda.to_device(out_host)")}
      ${line("launch", "kernel[1, 1](out)")}
      ${line("download", "result = out.copy_to_host()")}
      ${line("print", 'print("out =", result.tolist())')}
      <h2 class="kernel">GPU kernel</h2>
      ${line("definition", "def kernel(out):")}
      ${line("write", "    out[0] = 42")}
    </section>
    <div class="hardware">
      <section class="cpu">
        <h2>CPU</h2>
        <div class="memory ${result ? "hot" : ""}">
          <h3>Host memory</h3>
          <code>${escape(host)}</code>
          <code class="${result ? "" : "empty"}">${escape(result ?? "result = [42]")}</code>
        </div>
      </section>
      <div class="arrow">${escape(transfer ?? "")}</div>
      <section class="gpu">
        <h2>GPU</h2>
        <div class="sm ${block ? "hot" : ""}">
          <h3>Compute unit · SM</h3>
          <div class="thread ${block ? "" : "empty"}">
            <strong>Block 0</strong><span>Thread 0${write ? " · writes ↓" : ""}</span>
          </div>
        </div>
        <div class="memory ${write || step === "upload" ? "hot" : ""}">
          <h3>Device memory</h3><code>${escape(device)}</code>
        </div>
      </section>
    </div>
  </div></main></html>`;
}

function slide(walkthrough, stage) {
  if (stage.trace) return traceSlide(walkthrough, stage);
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
        const content = await page.locator(stage.trace ? ".trace" : "ol").boundingBox();
        if (content.y + content.height > (stage.trace ? 308 : 410)) throw new Error(`Caption area is obstructed at ${content.y + content.height}px on "${stage.title}".`);
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
