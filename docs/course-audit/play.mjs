import { chromium } from "playwright-core";
import { walkthroughs } from "../../src/walkthroughs.mjs";
import fs from "node:fs";
const b = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const queue = Object.keys(walkthroughs),
  out = new URL("evidence/playback.jsonl", import.meta.url);
fs.writeFileSync(out, "");
async function play() {
  const p = await b.newPage({ viewport: { width: 390, height: 850 } });
  while (queue.length) {
    const slug = queue.shift();
    try {
      await p.goto("http://localhost:8012/#lesson/" + slug);
      await p.locator(".walkthrough > summary").press("Space");
      const v = p.locator(".walkthrough video");
      await v.scrollIntoViewIfNeeded();
      await v.evaluate(async (v) => {
        v.textTracks[0].mode = "showing";
        await v.play();
      });
      await p.waitForFunction(
        () => document.querySelector("video").currentTime > 1,
      );
      await v.screenshot({
        path: new URL(
          "evidence/frames/" + slug + "-inline.jpg",
          import.meta.url,
        ).pathname,
      });
      await p.waitForFunction(
        () => document.querySelector("video").ended,
        null,
        { timeout: 180000 },
      );
      const result = await v.evaluate((v) => ({
        duration: v.duration,
        rate: v.playbackRate,
        muted: v.muted,
        cues: v.textTracks[0].cues.length,
        quality: v.getVideoPlaybackQuality().totalVideoFrames,
        dropped: v.getVideoPlaybackQuality().droppedVideoFrames,
      }));
      fs.appendFileSync(out, JSON.stringify({ slug, ...result }) + "\n");
    } catch (e) {
      fs.appendFileSync(out, JSON.stringify({ slug, error: String(e) }) + "\n");
    }
  }
  await p.close();
}
await Promise.all([play(), play(), play()]);
await b.close();
