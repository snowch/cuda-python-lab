import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" }),
  p = await b.newPage();
await p.setContent(
  fs.readFileSync(
    new URL("prototypes/workbench.html", import.meta.url),
    "utf8",
  ),
);
for (const width of [320, 390, 820, 1440])
  for (const theme of ["light", "dark"]) {
    await p.setViewportSize({ width, height: 800 });
    await p.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (let mode = 0; mode < 4; mode++) {
      await p.selectOption("#mode", { index: mode });
      await p.click("#reveal");
      if (mode === 0) {
        for (let i = 0; i < 4; i++) await p.click("#next");
        assert.match(await p.locator("#drawing").innerText(), /result \[42\]/);
        await p.click("#reset");
      }
      if (mode === 1) {
        for (const [n, w, skip] of [
          [33, 32, 31],
          [33, 16, 15],
          [33, 8, 7],
          [16, 16, 0],
          [64, 32, 0],
        ]) {
          await p.selectOption("#n", String(n));
          await p.selectOption("#w", String(w));
          assert(
            (await p.locator("#drawing").innerText()).includes(skip + " skip"),
          );
        }
        await p.selectOption("#n", "33");
        await p.click('[data-cell="32"]');
        assert.match(await p.locator("#answer").innerText(), /= 99/);
      }
      if (mode === 2) {
        await p.selectOption("#warps", "1");
        await p.click("#next");
        assert.match(
          await p.locator("#answer").innerText(),
          /No eligible warp/,
        );
        await p.click("#reset");
        await p.selectOption("#warps", "3");
        await p.click("#next");
        assert.match(
          await p.locator("#answer").innerText(),
          /Warp 1 issues load/,
        );
      }
      if (mode === 3) {
        await p.click('[data-cell="6"]');
        assert.match(await p.locator("#answer").innerText(), /24/);
        await p.selectOption("#stage", { index: 2 });
        assert.match(
          await p.locator("#answer").innerText(),
          /8 sectors, 12.5%/,
        );
        await p.selectOption("#lanes", "32");
        assert.match(await p.locator("#answer").innerText(), /32 sectors/);
        await p.selectOption("#stage", { index: 3 });
        assert.match(await p.locator("#answer").innerText(), /29 banks used/);
        await p.selectOption("#tile", "32");
        assert.match(await p.locator("#answer").innerText(), /in a bank = 1/);
        await p.selectOption("#pad", "0");
        assert.match(await p.locator("#answer").innerText(), /in a bank = 32/);
      }
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    console.log(width, theme, "four model checks passed");
  }
await b.close();
