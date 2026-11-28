import { chromium } from "playwright-core";
import { lessons } from "../../src/course.mjs";
import fs from "node:fs";
const dir = new URL("evidence/", import.meta.url);
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
});
const page = await browser.newPage();
await page.addInitScript(() =>
  localStorage.setItem("cuda-python-lab:code-runner-intro:3", "1"),
);
const base = process.env.AUDIT_URL || "http://localhost:8012";
const add = (s) => ["    return result", "    " + s + "\n    return result"];
const steps = {
  "first-value": [
    0,
    ["out[0] = 42", "out[0] = 73"],
    add("print(out_host.tolist())"),
  ],
  "vector-add": [0, ["kernel[2, 32]", "kernel[3, 16]"]],
  "grid-stride": [0, ["kernel[2, 8]", "kernel[2, 4]"]],
  transfers: [
    0,
    add("print(x_host.nbytes, y_host.nbytes, result.nbytes)"),
    1,
    add("print(x_host.nbytes, y_host.nbytes, result.nbytes)"),
  ],
  coalescing: [0, add("print(result[:8, 0])"), 1],
  divergence: [
    0,
    add(
      "print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0))",
    ),
    1,
    add(
      "print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0))",
    ),
  ],
  reduction: [0, 1],
  histogram: [
    0,
    1,
    ["cuda.atomic.add(counts, tokens[i], 1)", "counts[tokens[i]] += 1"],
    "repeat",
    "repeat",
    "repeat",
    "restore",
  ],
  scan: [0, 1],
  "tiled-transpose": [
    0,
    add("print(result[0, 2])"),
    ["PADDING = 1", "PADDING = 0"],
    1,
    "restore",
  ],
  matmul: [0, 1],
  softmax: [
    0,
    add("print(result.sum(axis=1))"),
    [" - row_max)", " )", ...add("print(np.isfinite(result).all())")],
    1,
    "restore",
  ],
  gather: [0, 1, ["values[indices[i]]", "values[i]"]],
  stencil: [
    0,
    1,
    ["tile[0] = values[i - 1] if i > 0 else 0.0", "tile[0] = 0.0"],
    2,
    "restore",
  ],
  precision: [
    0,
    ["a[i] + b[i]", "a[i] + c[i]", "first + c[i]", "first + b[i]"],
    1,
    "restore",
  ],
  "sync-debug": [1, 0, ["else -1", "else -9"]],
  fusion: [0, 1, 0, ["if use_temp:", "if False:"]],
};
const source = page.getByRole("textbox", { name: "Python program source" });
const mode = process.argv[2] || "steps";
const report = new URL(mode + "-final.jsonl", dir);
fs.writeFileSync(report, "");
try {
  for (const [slug, lesson] of Object.entries(lessons)) {
    await page.goto(base + "/#lesson/" + slug);
    await page
      .getByRole("heading", { name: lesson.title, exact: true })
      .waitFor();
    let idx = 0;
    for (const action of mode === "cases"
      ? lesson.cases.map((_, i) => i)
      : steps[slug]) {
      const row = { slug, action };
      try {
        if (typeof action === "number") {
          idx = action;
          if (lesson.cases.length > 1)
            await page.locator("#case").selectOption(String(idx));
        } else if (action === "restore") {
          await page
            .locator("#restore")
            .evaluate((el) => (el.closest("details").open = true));
          await page.locator("#restore").click();
        } else if (Array.isArray(action)) {
          await page
            .locator("#download-source")
            .evaluate((el) => (el.closest("details").open = true));
          const exported = page.waitForEvent("download");
          await page.locator("#download-source").click();
          let code = fs.readFileSync(await (await exported).path(), "utf8");
          for (let i = 0; i < action.length; i += 2) {
            if (!code.includes(action[i]))
              throw Error("Missing editor anchor " + action[i]);
            code = code.replaceAll(action[i], action[i + 1]);
          }
          await source.press("Control+a");
          await page.keyboard.insertText(code);
        }
        const fixture = lesson.cases[idx];
        Object.assign(row, {
          fixture: fixture.label,
          expectedStarter: fixture.expected,
        });
        await page.getByRole("button", { name: "Run", exact: true }).click();
        await page
          .locator("#run-status")
          .filter({
            hasText:
              /Ran in GPGPU-Sim|Execution stopped|Code runner files|too long|Could not|without a CUDA launch/,
          })
          .waitFor({ timeout: 60000 });
        row.status = await page.locator("#run-status").innerText();
        row.output = await page.locator("#run-output").innerText();
        if (slug === "divergence" || slug === "first-value")
          fs.writeFileSync(
            new URL(mode + "-" + slug + "-" + idx + ".ptx", dir),
            await page.locator("#ptx-output").textContent(),
          );
      } catch (e) {
        row.error = String(e);
        console.error(slug, row.error);
      }
      fs.appendFileSync(report, JSON.stringify(row) + "\n");
    }
  }
} finally {
  await browser.close();
}
