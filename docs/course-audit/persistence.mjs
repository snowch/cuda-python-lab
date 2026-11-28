import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const c = await b.newContext(),
  a = await c.newPage(),
  d = await c.newPage();
const base = "http://localhost:8012/#lesson/";
await a.goto(base + "vector-add");
await d.goto(base + "stencil");
await d.locator("#prediction").waitFor();
const editor = a.getByRole("textbox", { name: "Python program source" });
await editor.press("Control+Home");
await a.keyboard.insertText("# audit marker\n");
await a.fill("#prediction", "Index 32 belongs to block 1");
await d.fill("#prediction", "Boundary reads the halo");
console.log(
  "Durable predictions after both inputs:",
  await d.evaluate(
    () => JSON.parse(localStorage.getItem("cuda-python-lab-v1")).predictions,
  ),
);
const fresh = await c.newPage();
await fresh.goto(base + "vector-add");
console.log(
  "Vector prediction in fresh third tab:",
  JSON.stringify(await fresh.locator("#prediction").inputValue()),
);
console.log(
  "Fresh third tab shows code marker:",
  (await fresh.locator(".cm-content").innerText()).includes("# audit marker"),
);
await a.reload();
console.log(
  "After another tab edits a different lesson, original vector prediction:",
  JSON.stringify(await a.locator("#prediction").inputValue()),
);
const q = await b.newPage();
await q.addInitScript(() => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === "cuda-python-lab-v1")
      throw new DOMException(
        "Audit: simulated full storage",
        "QuotaExceededError",
      );
    return orig.call(this, k, v);
  };
});
await q.goto(base + "first-value");
await q.fill("#prediction", "42");
console.log(
  "Quota injection, visible save error:",
  await q.getByText(/could not save|not saved|unable to save/i).allInnerTexts(),
);
await q.reload();
console.log(
  "Prediction after reload with denied write:",
  JSON.stringify(await q.locator("#prediction").inputValue()),
);
await b.close();
