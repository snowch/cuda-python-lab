import { chromium } from "playwright-core";
import fs from "node:fs";
import { standaloneProgram } from "../../src/host-program.mjs";
import { lessons } from "../../src/course.mjs";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" }),
  p = await b.newPage();
await p.addInitScript(() =>
  localStorage.setItem("cuda-python-lab:code-runner-intro:3", "1"),
);
await p.goto("http://localhost:8012/#first-value");
const starter = standaloneProgram(
  fs.readFileSync("src/kernels/first-value.py", "utf8"),
  lessons["first-value"].cases[0],
);
for (const [label, code] of [
  ["syntax", starter.replace("def kernel(out):", "def kernel(out)")],
  ["zero-width block", starter.replace("kernel[1, 1]", "kernel[1, 0]")],
  ["one-past output", starter.replace("out[0] = 42", "out[1] = 42")],
  ["restored", starter],
]) {
  const src = p.getByRole("textbox", { name: "Python program source" });
  await src.press("Control+a");
  await p.keyboard.insertText(code);
  await p.click("#run");
  try {
    await p
      .locator("#run-status")
      .filter({
        hasText:
          /Ran in GPGPU-Sim|Execution stopped|too long|Could not|without a CUDA launch/,
      })
      .waitFor({ timeout: 55000 });
  } catch (e) {
    if (await p.locator("#stop").isVisible()) await p.click("#stop");
    console.log(label, String(e));
  }
  console.log(
    label,
    await p.locator("#run-status").innerText(),
    await p.locator("#run-output").textContent(),
  );
}
await b.close();
