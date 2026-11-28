import { chromium } from "playwright-core";
import { walkthroughs } from "../../src/walkthroughs.mjs";
import fs from "node:fs";
const out = new URL("evidence/media-layout/", import.meta.url);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" }),
  p = await b.newPage();
for (const [slug, s] of Object.entries(walkthroughs)) {
  await p.goto("http://localhost:8012/#lesson/" + slug);
  await p.locator(".walkthrough > summary").click();
  const v = p.locator("video");
  await v.scrollIntoViewIfNeeded();
  await v.evaluate(async (v) => {
    v.muted = true;
    v.textTracks[0].mode = "showing";
    await v.play();
    v.pause();
    await new Promise((resolve) => {
      v.addEventListener("seeked", resolve, { once: true });
      v.currentTime = 2;
    });
  });
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [820, 1100],
    [1440, 900],
  ])
    for (const theme of ["light", "dark"]) {
      await p.setViewportSize({ width, height });
      await p.emulateMedia({ colorScheme: theme });
      await p.waitForFunction(
        (t) => document.documentElement.dataset.theme === t,
        theme,
      );
      if (width === 844) await v.evaluate((v) => v.requestFullscreen());
      await v.screenshot({
        path: new URL(slug + "-" + width + "-" + theme + ".jpg", out).pathname,
        quality: 65,
      });
      if (width === 844) await p.evaluate(() => document.exitFullscreen());
    }
  console.log(
    slug,
    s.stages.length,
    "paused clip, captions on; portrait, landscape fullscreen, tablet, desktop captured in both themes",
  );
}
await b.close();
