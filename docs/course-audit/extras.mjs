import { chromium } from "playwright-core";
import fs from "node:fs";
import { standaloneProgram } from "../../src/host-program.mjs";
import { lessons } from "../../src/course.mjs";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" }),
  p = await browser.newPage();
await p.addInitScript(() =>
  localStorage.setItem("cuda-python-lab:code-runner-intro:3", "1"),
);
await p.goto("http://localhost:8012/#gpu");
for (const [threads, shared] of [
  [64, 8],
  [256, 8],
  [256, 16],
]) {
  await p.selectOption("#resource-threads", String(threads));
  await p.selectOption("#resource-shared", String(shared));
  console.log(
    threads,
    shared,
    await p.locator("#resource-result").textContent(),
    await p.locator("#resource-limits").innerText(),
  );
}
for (const [slug, change] of [
  [
    "first-value",
    (s) =>
      s
        .replace("out[0] = 42", "out[0] = 73")
        .replace("np.zeros(1, dtype", "np.array([5], dtype")
        .replace(
          "    return result",
          "    print(out_host.tolist())\n    return result",
        ),
  ],
  [
    "scan",
    (s) =>
      s.replace(
        "    return result",
        "    print(result[[0, 2, 3, 6]] - 1)\n    return result",
      ),
  ],
  [
    "precision",
    (s) =>
      s.replace(
        "    return result",
        "    print(np.float64(16777216) + 1 - 16777216)\n    return result",
      ),
  ],
]) {
  await p.goto("http://localhost:8012/#lesson/" + slug);
  const source = standaloneProgram(
    fs.readFileSync(
      new URL("../../src/kernels/" + slug + ".py", import.meta.url),
      "utf8",
    ),
    lessons[slug].cases[0],
  );
  await p
    .getByRole("textbox", { name: "Python program source" })
    .press("Control+a");
  await p.keyboard.insertText(change(source));
  await p.click("#run");
  await p
    .locator("#run-status")
    .filter({ hasText: /Ran in GPGPU-Sim|Execution stopped/ })
    .waitFor({ timeout: 60000 });
  console.log(
    slug,
    await p.locator("#run-status").innerText(),
    await p.locator("#run-output").innerText(),
  );
}
await browser.close();
