import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import fs from "node:fs";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" }),
  p = await b.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
await p.addInitScript(() =>
  localStorage.setItem("cuda-python-lab:code-runner-intro:3", "1"),
);
await p.goto("http://localhost:8012/#lesson/first-value");
await p.locator("#run").tap();
await p
  .locator("#run-status")
  .filter({ hasText: /Ran in GPGPU-Sim/ })
  .waitFor({ timeout: 60000 });
await p.locator("#code-runner-open").tap();
console.log(
  "Run elapsed / allocated",
  await p.locator("[data-runner-time]").innerText(),
  await p.locator("[data-runner-memory]").innerText(),
);
await p.locator("[data-runner-free]").tap();
await p.waitForFunction(
  () =>
    document.querySelector("[data-runner-memory]").textContent === "0.0 MiB",
);
console.log(
  "After free",
  await p.locator("[data-runner-memory]").textContent(),
  await p.locator("#run-output").textContent(),
);
await p.locator("[data-runner-close]").tap();
const src = p.getByRole("textbox", { name: "Python program source" });
await src.tap();
await src.press("Escape");
await p.keyboard.press("Tab");
console.log(
  "Focus after editor Esc Tab",
  await p.evaluate(() => document.activeElement.outerHTML.slice(0, 150)),
);
await p.goto("http://localhost:8012/#gpu");
await p.locator("#resource-threads").waitFor();
const pre = p.locator(".reading pre").first();
console.log("Appendix pre tabindex", await pre.getAttribute("tabindex"));
await p.setViewportSize({ width: 1280, height: 800 });
await p.evaluate(() => (document.documentElement.style.zoom = 2));
console.log(
  "CSS zoom 200% appendix",
  await p.evaluate(() => ({
    width: innerWidth,
    page: document.documentElement.scrollWidth,
    visualViewport: visualViewport.width,
  })),
);
await p.setViewportSize({ width: 390, height: 844 });
await p.evaluate(() => (document.documentElement.style.zoom = 1));
await p.goto("http://localhost:8012/#lesson/softmax");
await p.locator("#case").selectOption("1");
await p.locator("#prediction").fill("Lane 0 also writes column 32");
await p.reload();
console.log(
  "Restored prediction / prompt / case",
  await p.locator("#prediction").inputValue(),
  await p.locator("#prediction-prompt").innerText(),
  await p.locator("#case option:checked").innerText(),
);
await p.selectOption("#case", "0");
console.log(
  "Same answer on original case",
  await p.locator("#prediction").inputValue(),
);
const q = await b.newPage({ viewport: { width: 390, height: 844 } });
await q.setContent(
  fs.readFileSync(new URL("prototypes/halo.html", import.meta.url), "utf8"),
);
console.log("Replay before restore", await q.locator("#reading").innerText());
await q.selectOption("#run", "4");
console.log("Replay after restore", await q.locator("#reading").innerText());
async function checkSelection(index, value, reference) {
  const pressed = q.getByRole("button", {pressed: true});
  assert.equal(await pressed.count(), 1);
  assert.equal(await pressed.getAttribute("aria-label"), "Index " + index + ", matches reference");
  const reading = (await q.locator("#reading").innerText()).trim();
  assert.equal(reading, "out[" + index + "] = " + value + ". CPU reference = " + reference + ".");
  console.log(await q.locator("#run option:checked").innerText(), reading, "One pressed index:", index);
}
await q.selectOption("#run", "1");
const last = q.getByRole("button", {name: "Index 15, matches reference"});
await last.focus();
await last.press("Space");
assert.equal(await last.evaluate(button => button === document.activeElement), true);
await checkSelection(15, 31, 31);
await q.selectOption("#run", "3");
await checkSelection(12, 25, 25);
await q.selectOption("#run", "1");
await checkSelection(12, 39, 39);
for (const width of [390, 320]) {
  await q.setViewportSize({width, height: 844});
  assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
await b.close();
