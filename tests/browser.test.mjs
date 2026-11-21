import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { unzipSync } from "fflate";
import { lessons } from "../src/course.mjs";

const dist = new URL("../dist/", import.meta.url);
const mime = new Map([
  ["html", "text/html"], ["css", "text/css"], ["js", "text/javascript"],
  ["mjs", "text/javascript"], ["wasm", "application/wasm"], ["json", "application/json"],
]);

async function runBrowser(t, viewport, exercise) {
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
      const contents = await readFile(new URL(path, dist));
      response.setHeader("Content-Type", mime.get(path.split(".").at(-1)) ?? "application/octet-stream");
      response.end(contents);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? ["/usr/bin/chromium", "/usr/bin/google-chrome"].find(existsSync);
  const browser = await chromium.launch({ executablePath });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await exercise(page);
  assert.deepEqual(errors, []);
}

const status = (page, kind) => page.locator(`#run-status.${kind}`).waitFor();

test("every browser case runs Python and matches its full reference", async (t) => {
  await runBrowser(t, { width: 1400, height: 960 }, async (page) => {
    for (const [slug, lesson] of Object.entries(lessons)) {
      await page.locator(`#lesson-nav a[href="#lesson/${slug}"]`).click();
      await page.getByRole("heading", { name: lesson.title, exact: true }).waitFor();
      for (const [i, fixture] of lesson.cases.entries()) {
        await page.locator("#case").selectOption(String(i));
        await page.getByRole("button", { name: "Run kernel" }).click();
        await status(page, "success");
        assert.match(await page.locator("#run-status").textContent(), new RegExp(`Verified ${fixture.expected.length} output`));
      }
    }
  });
});

test("mobile lesson flow traces the boundary thread, persists drafts, and exports the changed source", async (t) => {
  await runBrowser(t, { width: 393, height: 852 }, async (page) => {
    await page.getByText("Course lessons", { exact: false }).click();
    await page.locator('#lesson-nav a[href="#lesson/vector-add"]').click();
    await page.getByRole("heading", { name: "One thread, one element", exact: true }).waitFor();
    assert.equal(await page.locator("#mobile-nav").evaluate((menu) => menu.open), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    await page.getByRole("textbox", { name: "Predict before you run" }).fill("Block 1, lane 0");
    const editor = page.getByRole("textbox", { name: "Python kernel source" });
    const starter = await editor.inputValue();
    await page.getByRole("button", { name: "Run kernel" }).click();
    await status(page, "success");
    await page.locator("#block").selectOption("1");
    await page.getByRole("button", { name: "Thread 0, trace events", exact: true }).click();
    assert.deepEqual(await page.locator("#trace-output tbody tr").last().locator("td").allTextContents(),
      ["0", "write", "global", "out", "32", "32", "99", "–"]);
    assert.match(await page.locator("#result-output tbody tr").last().textContent(), /Block 1 · thread 0/);
    assert.match(await page.getByRole("button", { name: "Thread 1, no recorded events", exact: true }).textContent(), /1/);

    const modified = starter.replace("a[i] + b[i]", "a[i] - b[i]");
    await editor.fill(modified);
    await page.getByRole("button", { name: "Run kernel" }).click();
    await status(page, "failure");
    assert.match(await page.locator("#run-status").textContent(), /33 of 33/);

    const [download] = await Promise.all([
      page.waitForEvent("download"), page.getByRole("button", { name: "Download notebook" }).click(),
    ]);
    assert.equal(download.suggestedFilename(), "vector-add.ipynb");
    const notebook = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.ok(notebook.cells.some((cell) => cell.source === modified));

    await page.getByRole("button", { name: "Restore starter" }).click();
    assert.equal(await editor.inputValue(), starter);
    await page.getByRole("button", { name: "Undo restore" }).click();
    assert.equal(await editor.inputValue(), modified);
    await page.getByRole("button", { name: "Mark complete" }).click();
    await page.reload();
    assert.equal(await editor.inputValue(), modified);
    assert.equal(await page.getByRole("textbox", { name: "Predict before you run" }).inputValue(), "Block 1, lane 0");
    await page.getByRole("button", { name: "Completed" }).waitFor();

    await page.getByRole("link", { name: "GPU setup" }).first().click();
    const [archive] = await Promise.all([
      page.waitForEvent("download"), page.getByRole("link", { name: "Download the native investigations" }).click(),
    ]);
    const files = unzipSync(new Uint8Array(await readFile(await archive.path())));
    assert.ok(files["profile_workloads.py"]);
    assert.ok(files["kernels/softmax.py"]);
    assert.ok(files["requirements.txt"]);
  });
});
