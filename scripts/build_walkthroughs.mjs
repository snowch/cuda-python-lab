import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { walkthroughs } from "../src/walkthroughs.mjs";
import { lessons } from "../src/course.mjs";
import { hostProgram } from "../src/host-program.mjs";

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
function coalescingSlide(stage, kernel) {
  const code = kernel.split("\n").filter(line => line.trim()).map(line =>
    `<code class="${line.trim() === "out[col, row] = values[row, col]" ? "current" : ""}">${escape(line)}</code>`
  ).join("");
  const groups = stage.mode === "read"
    ? `<div class="sector"><span>Sector 0 · 32 bytes</span><div class="cells">${Array.from({length:8}, (_, i) => `<b>${i}</b>`).join("")}</div></div>`
    : `<div class="sectors">${Array.from({length:8}, (_, i) => `<div class="sector"><span>Sector ${i}</span><b>${i * 8}</b></div>`).join("")}</div>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { margin:0; background:#142326; color:#effaf3; font:19px system-ui,sans-serif; }
    main { padding:22px 36px; } h1 { margin:0 0 12px; font-size:29px; }
    .layout { display:grid; grid-template-columns: 0.9fr 1.3fr; gap:20px; }
    .code { background:#101e21; border-radius:7px; padding:12px 0; align-self:start; }
    code { display:block; white-space:pre; font:16px/1.5 monospace; padding:0 9px; color:#b7d9ce; border-left:3px solid transparent; }
    .current { background:#365340; border-color:#b5ed8d; color:#effaf3; }
    .visual { background:#24393b; border-radius:7px; padding:13px 15px; }
    h2 { font-size:21px; margin:0 0 8px; }
    .lanes, .cells, .sectors { display:grid; grid-template-columns:repeat(8,1fr); gap:3px; }
    .lanes b, .cells b, .sector b { display:block; text-align:center; background:#365340; color:#effaf3; border-radius:3px; font: 15px/2 monospace; }
    .direction { text-align:center; margin:4px 0; color:#b7d9ce; font-size:16px; }
    .sector { border:1px solid #527071; border-radius:4px; padding:4px; min-width:0; }
    .sector span { display:block; font-size:12px; color:#b7d9ce; white-space:nowrap; }
    .sectors { gap:2px; } .sectors .sector { padding:3px 1px; text-align:center; }
    .note { margin:8px 0 0; font-size:15px; color:#b7d9ce; }
  </style><main><div class="trace"><h1>${escape(stage.title)}</h1><div class="layout">
    <div class="code">${code}</div>
    <div class="visual"><h2>Warp lanes 0–7</h2><div class="lanes">${Array.from({length:8}, (_,i) => `<b>${i}</b>`).join("")}</div>
    <div class="direction">↓ ${stage.mode === "read" ? "read offsets" : "write offsets"}</div>
    ${groups}<p class="note">${escape(stage.note)}</p></div>
  </div></div></main></html>`;
}

function transferSlide(stage, program) {
  const code = stage.lines.map(line => {
    if (!program.main.includes(line) && !program.kernel.includes(line))
      throw new Error(`Source line not found: ${line}`);
    return `<div class="code-line"><span>${program.main.includes(line) ? "CPU" : "GPU"}</span><code>${escape(line)}</code></div>`;
  }).join("");
  const path = (name, direction, bytes) => `<div class="path"><strong>${name}</strong><span>${direction}</span><strong>${bytes}</strong></div>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    * { box-sizing:border-box; } body { margin:0; background:#142326; color:#effaf3; font:19px system-ui,sans-serif; }
    main { padding:22px 36px; } h1 { margin:0 0 12px; font-size:29px; }
    .layout { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    .code { background:#101e21; border-radius:7px; padding:12px 0; align-self:start; }
    code { display:block; white-space:pre-wrap; overflow-wrap:anywhere; font:16px/1.65 monospace; padding:0 9px; color:#effaf3; }
    .code-line { display:grid; grid-template-columns:44px minmax(0,1fr); padding:0 9px; align-items:baseline; } .code-line span { color:#b7d9ce; font-size:14px; font-weight:700; }
    .visual { background:#24393b; border-radius:7px; padding:13px 15px; }
    .path { display:grid; grid-template-columns:1fr 1fr 1fr; padding:7px 0; gap:6px; align-items:center; }
    .path + .path { border-top:1px solid #527071; } .path span { color:#b5ed8d; text-align:center; font-size:22px; }
    .note { margin:10px 0 0; color:#b7d9ce; font-size:16px; }
  </style><main><div class="trace"><h1>${escape(stage.title)}</h1><div class="layout">
    <div class="code">${code}</div>
    <div class="visual">${path("CPU · x", "→", "GPU · x")}${path("CPU · y", "→", "GPU · y")}${stage.phase === "inputs" ? "" : stage.phase === "compute" ? path("", "", "GPU · out") : path("CPU · result", "←", "GPU · out")}
    <p class="note">${escape(stage.note)}</p></div>
  </div></div></main></html>`;
}

function reductionSlide(stage, kernel) {
  const lines = kernel.split("\n");
  const position = lines.findIndex(line => line.trim() === stage.highlight);
  if (position < 0) throw new Error(`Highlighted code not found: ${stage.highlight}`);
  const code = lines.slice(Math.max(0, position - 2), Math.min(lines.length, position + 3))
    .filter(line => line.trim()).map(line =>
      `<code class="${line.trim() === stage.highlight ? "current" : ""}">${escape(line)}</code>`
    ).join("");
  const values = stage.slots ?? (stage.phase === "after" ? [6,8,10,12,5,6,7,8] : [1,2,3,4,5,6,7,8]);
  const chosen = stage.slotHighlights ?? (stage.phase === "start" ? [] : [1,5]);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    * { box-sizing:border-box; } body { margin:0; background:#142326; color:#effaf3; font:19px system-ui,sans-serif; }
    main { padding:22px 36px; } h1 { margin:0 0 12px; font-size:29px; }
    .layout { display:grid; grid-template-columns:0.9fr 1.25fr; gap:20px; }
    .code { background:#101e21; border-radius:7px; padding:12px 0; align-self:start; }
    code { display:block; white-space:pre-wrap; overflow-wrap:anywhere; font:16px/1.45 monospace; padding:0 9px; color:#b7d9ce; border-left:3px solid transparent; }
    .current { background:#365340; border-color:#b5ed8d; color:#effaf3; }
    .visual { background:#24393b; border-radius:7px; padding:13px 15px; }
    h2 { font-size:20px; margin:0 0 8px; }
    .slots { display:grid; grid-template-columns:repeat(8,1fr); gap:3px; }
    .slot { text-align:center; padding:5px 0; background:#142326; border:1px solid #527071; border-radius:3px; }
    .slot span { display:block; color:#b7d9ce; font-size:13px; }
    .slot strong { display:block; font: 20px/1.5 monospace; }
    .chosen { border-color:#b5ed8d; background:#365340; }
    .note { margin:10px 0 0; font-size:17px; color:#d4e7df; }
  </style><main><div class="trace"><h1>${escape(stage.title)}</h1><div class="layout">
    <div class="code">${code}</div>
    <div class="visual"><h2>${escape(stage.memoryLabel ?? "Block 0 · shared scratch")}</h2><div class="slots" style="grid-template-columns:repeat(${values.length},1fr)">${values.map((value,index) =>
      `<div class="slot ${chosen.includes(index) ? "chosen" : ""}"><span>${index}</span><strong>${value}</strong></div>`
    ).join("")}</div><p class="note">${escape(stage.note)}</p></div>
  </div></div></main></html>`;
}

function patternSlide(stage, kernel) {
  const lines = kernel.split("\n");
  const position = lines.findIndex(line => line.trim() === stage.highlight);
  if (position < 0) throw new Error(`Highlighted code not found: ${stage.highlight}`);
  const code = lines.filter(line => line.trim()).map(line =>
    `<code class="${line.trim() === stage.highlight ? "current" : ""}">${escape(stage.sceneKind === "race" && line.trim() === stage.highlight ? line.replace(stage.highlight, "counts[tokens[i]] += 1") : line)}</code>`
  ).join("");
  const laneRow = (grouped, block) => {
    const lanes = Array.from({length:32}, (_,i) => grouped ? block === 0 : i % 2 === 0);
    return `<div class="warp"><span>Block ${block}</span><div class="lanes">${lanes.map(negative =>
      `<i class="${negative ? "negative" : "positive"}"></i>`).join("")}</div></div>`;
  };
  const visual = stage.sceneKind === "warp" ? `
    <h2>${stage.grouped ? "Grouped signs" : "Alternating signs"}</h2>
    ${laneRow(stage.grouped,0)}${laneRow(stage.grouped,1)}
    <div class="legend"><span class="negative">Negative</span><span class="positive">Positive</span></div>
    <p>${escape(stage.note)}</p>` : stage.sceneKind === "race" ? `
    <h2>Plain increment · edited code</h2>
    <div class="race"><div>Thread A <strong>read 0 → write 1</strong></div><div>Thread B <strong>read 0 → write 1</strong></div></div>
    <p>${escape(stage.note)}</p>` : `
    <h2>Four counters</h2>
    <div class="counters">${[0,1,2,3].map((index) =>
      `<div><span>${index}</span><strong class="${index === 2 ? "selected" : ""}">${index === 2 ? escape(stage.count) : "0"}</strong></div>`).join("")}</div>
    <p>${escape(stage.note)}</p>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    * { box-sizing:border-box; } body { margin:0; background:#142326; color:#effaf3; font:19px system-ui,sans-serif; }
    main { padding:22px 36px; } h1 { margin:0 0 12px; font-size:29px; }
    h2 { margin:0 0 12px; font-size:21px; }
    .layout { display:grid; grid-template-columns:1fr 1.15fr; gap:20px; }
    .code { background:#101e21; border-radius:7px; padding:12px 0; align-self:start; }
    code { display:block; white-space:pre; font:16px/1.5 monospace; padding:0 9px; color:#b7d9ce; border-left:3px solid transparent; }
    .current { background:#365340; border-color:#b5ed8d; color:#effaf3; }
    .visual { background:#24393b; border-radius:7px; padding:14px 16px; }
    .warp { display:grid; grid-template-columns:64px 1fr; gap:8px; align-items:center; margin-bottom:12px; font-size:15px; }
    .lanes { display:grid; grid-template-columns:repeat(32,1fr); gap:2px; }
    .lanes i { height:25px; border-radius:2px; } .negative { background:#97d8ba; color:#142326; } .positive { background:#778ea6; color:#101e21; }
    .legend { display:flex; gap:8px; font-size:14px; } .legend span { padding:2px 7px; border-radius:3px; }
    .race div { display:flex; justify-content:space-between; gap:12px; padding:8px; border-bottom:1px solid #527071; } .race strong { color:#b5ed8d; font-family:monospace; }
    .counters { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; text-align:center; }
    .counters span, .counters strong { display:block; } .counters span { font-size:14px; color:#b7d9ce; }
    .counters strong { font:24px/1.8 monospace; background:#142326; border:1px solid #527071; border-radius:4px; }
    .counters .selected { border-color:#b5ed8d; background:#365340; }
    p { margin:12px 0 0; font-size:16px; line-height:1.35; color:#d4e7df; }
  </style><main><div class="trace"><h1>${escape(stage.title)}</h1><div class="layout"><div class="code">${code}</div><div class="visual">${visual}</div></div></div></main></html>`;
}

function statesSlide(stage, kernel) {
  const lines = kernel.split("\n");
  const position = lines.findIndex(line => line.trim() === stage.highlight);
  if (position < 0) throw new Error(`Highlighted code not found: ${stage.highlight}`);
  const code = lines.slice(Math.max(0, position - 2), Math.min(lines.length, position + 3))
    .filter(line => line.trim()).map(line =>
      `<code class="${line.trim() === stage.highlight ? "current" : ""}">${escape(line)}</code>`
    ).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    * { box-sizing:border-box; } body { margin:0; background:#142326; color:#effaf3; font:19px system-ui,sans-serif; }
    main { padding:22px 36px; } h1 { margin:0 0 12px; font-size:29px; }
    .layout { display:grid; grid-template-columns:0.9fr 1.25fr; gap:20px; }
    .code { background:#101e21; border-radius:7px; padding:12px 0; align-self:start; }
    code { display:block; white-space:pre-wrap; overflow-wrap:anywhere; font:16px/1.45 monospace; padding:0 9px; color:#b7d9ce; border-left:3px solid transparent; }
    .current { background:#365340; border-color:#b5ed8d; color:#effaf3; }
    .visual { background:#24393b; border-radius:7px; padding:12px 15px; }
    .row { display:grid; grid-template-columns:100px minmax(0,1fr); gap:7px; align-items:center; margin-bottom:8px; }
    .label { font-size:15px; color:#b7d9ce; } .cells { display:flex; gap:4px; }
    .cell { flex:1; min-width:0; text-align:center; padding:7px 2px; background:#142326; border:1px solid #527071; border-radius:3px; font:15px/1.3 monospace; overflow-wrap:anywhere; }
    .cell.mark { border-color:#b5ed8d; background:#365340; }
    .note { margin:8px 0 0; font-size:16px; line-height:1.35; color:#d4e7df; }
  </style><main><div class="trace"><h1>${escape(stage.title)}</h1><div class="layout">
    <div class="code">${code}</div>
    <div class="visual">${stage.rows.map(row => `<div class="row"><span class="label">${escape(row.label)}</span><div class="cells">${row.cells.map((cell,index) => `<span class="cell ${row.mark?.includes(index) ? "mark" : ""}">${escape(String(cell))}</span>`).join("")}</div></div>`).join("")}<p class="note">${escape(stage.note)}</p></div>
  </div></div></main></html>`;
}

function vectorSlide(stage, kernel) {
  const highlighted = stage.highlight ?? "";
  const lines = kernel.split("\n");
  const position = lines.findIndex(line => line.trim() === highlighted);
  if (position < 0) throw new Error(`Highlighted code not found: ${highlighted}`);
  const selected = lines.length > 14
    ? lines.slice(Math.max(0, position - 2), Math.min(lines.length, position + 3))
    : lines;
  const code = selected.filter(line => line.trim()).map(line =>
    `<code class="${line.trim() === highlighted ? "current" : ""}">${escape(line)}</code>`
  ).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #142326; color: #effaf3; font: 21px system-ui, sans-serif; }
    main { padding: 26px 38px; }
    h1 { font-size: 30px; margin: 0 0 18px; line-height: 1.1; }
    .layout { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr); gap: 22px; }
    .code { background: #101e21; border-radius: 7px; padding: 14px 0; align-self: start; }
    code { display: block; white-space: pre; font: 16px/1.35 monospace; color: #b7d9ce; padding: 0 10px; border-left: 3px solid transparent; white-space: pre-wrap; overflow-wrap: anywhere; }
    .current { color: #effaf3; background: #365340; border-color: #b5ed8d; }
    .visual { background: #24393b; border-radius: 7px; padding: 16px 20px; }
    .visual p { margin: 0; padding: 6px 0; font-size: 19px; line-height: 1.3; }
    .visual p + p { border-top: 1px solid #527071; }
  </style><main><div class="trace"><h1>${escape(stage.title)}</h1><div class="layout">
    <div class="code">${code}</div>
    <div class="visual">${stage.diagram.map(line => `<p>${escape(line)}</p>`).join("")}</div>
  </div></div></main></html>`;
}

function slide(walkthrough, stage, program) {
  if (stage.rows) return statesSlide(stage, program.kernel);
  if (stage.sceneKind) return patternSlide(stage, program.kernel);
  if (stage.lines) return transferSlide(stage, program);
  if (stage.phase) return reductionSlide(stage, program.kernel);
  if (stage.mode) return coalescingSlide(stage, program.kernel);
  if (stage.highlight) return vectorSlide(stage, program.kernel);
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
      ...(stage.hold !== undefined || stage.narration.endsWith("?") ? { hold: stage.hold ?? 3 } : {}),
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
    for (const { slug, directory, walkthrough, scenes } of recordings) {
      const program = walkthrough.stages.some(stage => stage.highlight || stage.mode || stage.phase || stage.lines) ? {
        kernel: await readFile(new URL(`../src/kernels/${slug}.py`, import.meta.url), "utf8"),
        main: hostProgram(lessons[slug].cases[0]).split("\nif __name__")[0],
      } : undefined;
      const slides = join(directory, "slides");
      await mkdir(slides, { recursive: true });
      await writeFile(join(directory, "scenes.json"), formatScenes(scenes));
      for (const [index, stage] of walkthrough.stages.entries()) {
        await page.setContent(slide(walkthrough, stage, program));
        const content = await page.locator(stage.highlight || stage.mode || stage.phase || stage.lines ? ".trace" : "ol").boundingBox();
        if (content.y + content.height > (stage.highlight || stage.mode || stage.phase || stage.lines ? 390 : 410)) throw new Error(`Caption area is obstructed at ${content.y + content.height}px on "${stage.title}".`);
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
