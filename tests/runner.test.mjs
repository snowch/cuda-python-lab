import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { lessons } from "../src/course.mjs";
import { standaloneProgram } from "../src/host-program.mjs";

const root = new URL("../", import.meta.url);
const displayedRun = /Ran in GPGPU-Sim|Execution stopped|too long|Could not|without a CUDA launch/;

async function startCompiler(t) {
  const compiler = spawn(process.env.CUDA_COMPILER_PYTHON || "python3", ["compiler/server.py", "--port", "0"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => compiler.kill());
  let errors = "";
  compiler.stderr.on("data", (data) => { errors = (errors + data.toString()).slice(-4000); });
  return new Promise((resolve, reject) => {
    compiler.once("error", reject);
    compiler.once("exit", (code) => reject(new Error(`Compiler stopped (${code}).\n${errors}`)));
    const lines = createInterface({ input: compiler.stdout });
    lines.on("line", (line) => {
      const serverURL = line.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
      if (serverURL) resolve(serverURL);
    });
  });
}

async function runProgram(page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.locator("#run-status").filter({ hasText: displayedRun }).waitFor({ timeout: 50000 });
  return {
    status: await page.locator("#run-status").textContent(),
    output: await page.locator("#run-output").textContent(),
  };
}

async function replaceProgram(page, code) {
  await page.getByRole("textbox", { name: "Python program source" }).press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
}

test("Numba compiles the edited kernel and the browser runs the program in GPGPU-Sim", { timeout: 240000 }, async (t) => {
  const url = await startCompiler(t);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);
  const browser = await chromium.launch({ executablePath });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  await page.emulateMedia({ colorScheme: "dark" });
  const requests = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/compile")) requests.push(request.postDataJSON());
  });

  for (const [slug, lesson] of Object.entries(lessons)) {
    await page.goto(`${url}#lesson/${slug}`);
    await page.getByRole("heading", { name: lesson.title, exact: true }).waitFor();
    for (const [index, fixture] of lesson.cases.entries()) {
      if (index) await page.getByRole("combobox", { name: "Case" }).selectOption(String(index));
      const { status, output } = await runProgram(page);
      assert.equal(status, "Ran in GPGPU-Sim.", `${slug} / ${fixture.label}\n${output}`);
      const line = output.split("\n").find((row) => row.startsWith(fixture.output + " = "));
      assert.ok(line, slug);
      const actual = JSON.parse(line.split(" = ", 2)[1]).flat();
      assert.equal(actual.length, fixture.expected.length, slug);
      assert.ok(actual.every((value, i) =>
        Math.abs(value - fixture.expected[i]) <= 1e-6 + Math.abs(fixture.expected[i]) * 1e-5), slug);
    }
  }

  await page.goto(`${url}#lesson/first-value`);
  const starter = await readFile(new URL("../src/kernels/first-value.py", import.meta.url), "utf8");
  const fixture = lessons["first-value"].cases[0];
  const edited = standaloneProgram(starter.replace("42", "73"), fixture)
    .replace("def main():", 'HOST_LABEL = "This stays in the browser"\n\ndef main():')
    .replace("    return result", "    print(HOST_LABEL, out_host.tolist())\n    return result");
  await replaceProgram(page, edited);
  const result = await runProgram(page);
  assert.deepEqual(result, { status: "Ran in GPGPU-Sim.", output: "out = [73.0]\nThis stays in the browser [0.0]" });
  assert.match(requests.at(-1).source, /out\[0\] = 73/);
  assert.doesNotMatch(requests.at(-1).source, /main\(|HOST_LABEL|out_host/);
  assert.deepEqual(Object.keys(requests.at(-1)).sort(), ["kernel", "signature", "source"]);
  assert.match(await page.locator("#ptx-output").textContent(), /\.entry/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await replaceProgram(page, edited.replace("out[0] = 73", "out[0] = unknown(73)"));
  const bad = await runProgram(page);
  assert.match(bad.status, /error/);
  assert.match(bad.output, /supported CUDA/);

  await replaceProgram(page, edited.replace("def main():", "def main():\n    while True:\n        pass"));
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  assert.match(await page.locator("#run-status").textContent(), /Run stopped/);
  await replaceProgram(page, edited);
  assert.deepEqual(await runProgram(page), result);

  const twoKernels = `from numba import cuda
import numpy as np

@cuda.jit
def add_one(out):
    out[0] += 1

@cuda.jit
def add_three(out):
    out[0] += 3

def main():
    out = cuda.to_device(np.zeros(1, dtype=np.float32))
    add_one[1, 1](out)
    add_one[1, 1](out)
    add_three[1, 1](out)
    add_one[1, 1](out)
    print(out.copy_to_host().tolist())

if __name__ == "__main__":
    main()
`;
  await replaceProgram(page, twoKernels);
  assert.deepEqual(await runProgram(page), { status: "Ran in GPGPU-Sim.", output: "[6.0]" });

  const rejected = await fetch(new URL("api/compile", url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: 'def kernel(out, setup=print("side effect")): out[0] = 1',
      kernel: "kernel",
      signature: [{ dtype: "float32", ndim: 1 }],
    }),
  });
  assert.equal(rejected.status, 422);
  assert.match((await rejected.json()).error, /plain positional arguments/);
});
