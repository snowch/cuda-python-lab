import { chromium } from "playwright-core";
import { lessons } from "../../src/course.mjs";
import fs from "node:fs";
const out = new URL("evidence/views/", import.meta.url);
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const page = await browser.newPage();
const data = [];
for (const route of ["course", ...Object.keys(lessons), "gpu", "compiler"]) {
  await page.goto("http://localhost:8012/#" + route);
  await page.locator("main h1").first().waitFor();
  for (const width of [320, 390, 820, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.waitForFunction(
        (t) => document.documentElement.dataset.theme === t,
        theme,
      );
      await page.evaluate(() => document.fonts.ready);
      const row = await page.evaluate(() => ({
        heading: document.querySelector("main h1").innerText,
        overflow: document.documentElement.scrollWidth - innerWidth,
        theme: document.documentElement.dataset.theme,
        height: document.documentElement.scrollHeight,
        taskToRun: document.querySelector("#case")?.getBoundingClientRect().top,
        smallControls: [...document.querySelectorAll("button,summary,select")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height < 24;
          })
          .map((x) => x.textContent.trim()),
      }));
      data.push({ route, width, ...row });
      await page.screenshot({
        path: new URL(route + "-" + width + "-" + theme + ".jpg", out).pathname,
        type: "jpeg",
        quality: 55,
        fullPage: true,
        animations: "disabled",
      });
    }
}
fs.writeFileSync(new URL("../layout.json", out), JSON.stringify(data, null, 2));
await browser.close();
