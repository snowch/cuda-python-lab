// Usage: node scripts/build_walkthroughs.mjs /path/to/piper-voice.onnx
// Requires uv, FFmpeg, Chromium and the .onnx.json file beside the voice model.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { walkthroughs } from "../src/walkthroughs.mjs";

const voice = process.argv[2];
if (!voice) throw new Error("Pass the path to a Piper voice model.");
const assets = fileURLToPath(new URL("../src/media/", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "cuda-python-recordings-"));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);
let browser;

const synthesize = String.raw`
import io
import json
import math
from pathlib import Path
import re
import sys
import textwrap
import wave

from piper import PiperVoice
from piper.config import SynthesisConfig

voice = PiperVoice.load(sys.argv[1])
folder = Path(sys.argv[2])
sample_rate = voice.config.sample_rate
silence = b"\0\0" * round(0.18 * sample_rate)
durations = {}

for slug, recordings in json.load(sys.stdin).items():
    seconds_elapsed = 0
    cues = []
    durations[slug] = []

    for index, stage in enumerate(recordings["stages"]):
        samples = bytearray(silence)
        for sentence in re.split(r"(?<=[.!?]) ", stage["narration"]):
            start = seconds_elapsed + len(samples) / (2 * sample_rate)
            audio = io.BytesIO()
            with wave.open(audio, "wb") as writer:
                voice.synthesize_wav(sentence, writer, SynthesisConfig(length_scale=1.04))
            audio.seek(0)
            with wave.open(audio, "rb") as reader:
                samples.extend(reader.readframes(reader.getnframes()))
            end = seconds_elapsed + len(samples) / (2 * sample_rate)

            lines = textwrap.wrap(sentence, 43, break_long_words=False, break_on_hyphens=False)
            chunks = ["\n".join(lines[i:i+2]) for i in range(0, len(lines), 2)]
            time = start
            for chunk in chunks:
                next_time = time + (end - start) * len(chunk.split()) / len(sentence.split())
                cues.append((time, next_time, chunk))
                time = next_time
            samples.extend(silence)

        # Align the narration and image to whole video frames.
        duration = math.ceil((len(samples) / (2 * sample_rate) + 0.30) * 25) / 25
        durations[slug].append(duration)
        samples.extend(b"\0\0" * (round(duration * sample_rate) - len(samples) // 2))
        with wave.open(str(folder / f"{slug}-{index}.wav"), "wb") as writer:
            writer.setparams((1, 2, sample_rate, 0, "NONE", "not compressed"))
            writer.writeframes(samples)
        seconds_elapsed += duration

    def timestamp(seconds):
        stamp = round(seconds * 1000)
        return f"{stamp // 3600000:02}:{stamp // 60000 % 60:02}:{stamp // 1000 % 60:02}.{stamp % 1000:03}"

    vtt = "\n\n".join(f"{timestamp(a)} --> {timestamp(b)}\n{text}" for a, b, text in cues)
    (folder / f"{slug}.vtt").write_text(f"WEBVTT\n\n{vtt}\n", encoding="utf-8")

print(json.dumps(durations))
`;

const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function slide(walkthrough, stage) {
  return `<!doctype html><meta charset="utf-8"><style>
    * { box-sizing: border-box }
    body { margin: 0; background: #142326; color: #effaf3; font: 24px system-ui, sans-serif; }
    main { padding: 35px 55px; }
    header { color: #b7d9ce; font-weight: 650; font-size: 21px; padding-bottom: 14px; border-bottom: 1px solid #49615c; }
    h1 { font-size: 41px; line-height: 1.13; margin: 23px 0; letter-spacing: -.02em; }
    ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
    li { padding: 10px 16px; background: #24393b; border-left: 3px solid #729c93; border-radius: 4px; }
    li:last-child { background: #28473e; border-color: #a3ddc2; }
  </style><main><header>${escape(walkthrough.title)}</header>
  <h1>${escape(stage.title)}</h1>
  <ol>${stage.diagram.map((line) => `<li>${escape(line)}</li>`).join("")}</ol></main>`;
}

const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
try {
  const durations = JSON.parse(execFileSync("uv", ["run", "--with", "piper-tts", "python", "-c", synthesize, resolve(voice), temporary], {
    input: JSON.stringify(walkthroughs),
    encoding: "utf8",
  }));
  browser = await chromium.launch({ executablePath });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  for (const [slug, walkthrough] of Object.entries(walkthroughs)) {
    const destination = join(assets, slug);
    await mkdir(destination, { recursive: true });
    const clips = [];
    for (const [index, stage] of walkthrough.stages.entries()) {
      const basename = join(temporary, `${slug}-${index}`);
      await page.setContent(slide(walkthrough, stage));
      await page.screenshot({ path: `${basename}.png` });
      if (index === 0) ffmpeg(["-i", `${basename}.png`, "-frames:v", "1", join(destination, "poster.webp")]);
      ffmpeg(["-loop", "1", "-framerate", "25", "-i", `${basename}.png`, "-i", `${basename}.wav`,
        "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-crf", "22",
        "-c:a", "aac", "-b:a", "64k", "-t", String(durations[slug][index]), `${basename}.mp4`]);
      clips.push(`file '${basename}.mp4'`);
    }
    const playlist = join(temporary, `${slug}.txt`);
    await writeFile(playlist, clips.join("\n") + "\n");
    ffmpeg(["-f", "concat", "-safe", "0", "-i", playlist, "-c", "copy", "-movflags", "+faststart",
      join(destination, "walkthrough.mp4")]);
    await copyFile(join(temporary, `${slug}.vtt`), join(destination, "captions.vtt"));
    console.log(`Built ${slug} walkthrough.`);
  }
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
