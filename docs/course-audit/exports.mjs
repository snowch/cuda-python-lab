import fs from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { lessons } from "../../src/course.mjs";
import { standaloneProgram } from "../../src/host-program.mjs";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" }),
  p = await b.newPage();
async function download(id) {
  const locator = p.locator("#" + id);
  await locator.evaluate((el) => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement)
      if (parent.matches("details")) parent.open = true;
  });
  await p.waitForTimeout(550);
  const pending = p.waitForEvent("download");
  await locator.click();
  return fs.readFileSync(await (await pending).path(), "utf8");
}
for (const [slug, l] of Object.entries(lessons)) {
  await p.goto("http://localhost:8012/#lesson/" + slug);
  await p.locator("#case").waitFor({ state: "attached" });
  for (const [i, f] of l.cases.entries()) {
    if (i) await p.locator("#case").selectOption(String(i));
    const source = await download("download-source"),
      nb = JSON.parse(await download("download-notebook"));
    const kernel = fs.readFileSync(
      new URL("../../src/kernels/" + slug + ".py", import.meta.url),
      "utf8",
    );
    assert.equal(source, standaloneProgram(kernel, f));
    assert(nb.cells.some((c) => c.cell_type === "code" && c.source === source));
    assert(nb.cells[0].source.includes(f.label));
    console.log(slug, f.label, "source and notebook program match fixture");
  }
}
await p.goto("http://localhost:8012/#compiler");
const nb = JSON.parse(await download("download-compiler-notebook"));
assert(nb.cells.some((c) => c.source.includes("signatures_after")));
console.log("Compiler notebook downloaded, signature comparison present.");
await b.close();
