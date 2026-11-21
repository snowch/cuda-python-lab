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
  const page = await browser.newPage({ viewport, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await exercise(page);
  assert.deepEqual(errors, []);
}

const status = (page, kind) => page.locator(`#run-status.${kind}`).waitFor();
const sourceEditor = (page) => page.getByRole("textbox", { name: "Python kernel source" });
const editorTools = (page) => page.locator("#editor-tools > summary");

async function openLesson(page, slug) {
  await page.locator("#course-nav > summary").click();
  await page.locator(`#lesson-nav a[href="#lesson/${slug}"]`).click();
  await page.getByRole("heading", { name: lessons[slug].title, exact: true }).waitFor();
}

async function readSource(editor) {
  await editor.press("ControlOrMeta+a");
  await editor.press("ControlOrMeta+c");
  return editor.page().evaluate(() => navigator.clipboard.readText());
}

async function replaceSource(page, editor, source) {
  await editor.press("ControlOrMeta+a");
  await page.keyboard.insertText(source);
}

test("every browser case runs Python and matches its full reference", async (t) => {
  await runBrowser(t, { width: 1400, height: 960 }, async (page) => {
    for (const [slug, lesson] of Object.entries(lessons)) {
      await openLesson(page, slug);
      for (const [i, fixture] of lesson.cases.entries()) {
        if (lesson.cases.length > 1) await page.locator("#case").selectOption(String(i));
        await page.getByRole("button", { name: "Run kernel" }).click();
        await status(page, "success");
        assert.match(await page.locator("#run-status").textContent(), new RegExp(`Verified ${fixture.expected.length} output`));
      }
    }
  });
});

test("mobile lesson flow traces the boundary thread, persists drafts, and exports the changed source", async (t) => {
  await runBrowser(t, { width: 393, height: 852 }, async (page) => {
    await openLesson(page, "vector-add");
    assert.equal(await page.locator("#course-nav").evaluate((menu) => menu.open), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    await page.getByRole("textbox", { name: "Predict before you run" }).fill("Block 1, lane 0");
    const editor = sourceEditor(page);
    const starter = await readSource(editor);
    await page.getByRole("button", { name: "Run kernel" }).click();
    await status(page, "success");
    await page.locator("#block").selectOption("1");
    await page.getByRole("button", { name: "Thread 0, trace events", exact: true }).click();
    assert.deepEqual(await page.locator("#trace-output tbody tr").last().locator("td").allTextContents(),
      ["0", "write", "global", "out", "32", "32", "99", "–"]);
    assert.match(await page.locator("#result-output tbody tr").last().textContent(), /Block 1 · thread 0/);
    assert.match(await page.getByRole("button", { name: "Thread 1, no recorded events", exact: true }).textContent(), /1/);

    const modified = starter.replace("a[i] + b[i]", "a[i] - b[i]");
    await replaceSource(page, editor, modified);
    await page.getByRole("button", { name: "Run kernel" }).click();
    await page.getByText("Edited kernel ran. 33 of 33 values differ from the starter reference.").waitFor();
    assert.equal(await page.locator("#run-status.failure").count(), 0);

    await page.getByText("Optional GPU experiment and downloads", { exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"), page.getByRole("button", { name: "Download notebook" }).click(),
    ]);
    assert.equal(download.suggestedFilename(), "vector-add.ipynb");
    const notebook = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.ok(notebook.cells.some((cell) => cell.source === modified));
    assert.ok(notebook.cells.some((cell) => cell.source.includes("Edited kernel ran.")));

    await editorTools(page).click();
    await page.getByRole("button", { name: "Restore starter" }).click();
    assert.equal(await readSource(editor), starter);
    await page.reload();
    await editorTools(page).click();
    await page.getByRole("button", { name: "Undo restore" }).click();
    assert.equal(await readSource(editor), modified);
    await page.getByRole("button", { name: "Mark complete" }).click();
    await page.reload();
    assert.equal(await readSource(editor), modified);
    assert.equal(await page.getByRole("textbox", { name: "Predict before you run" }).inputValue(), "Block 1, lane 0");
    await page.getByRole("button", { name: "Completed" }).waitFor();

    await page.getByRole("link", { name: "Appendix A" }).first().click();
    const [archive] = await Promise.all([
      page.waitForEvent("download"), page.getByRole("link", { name: "Download the native investigations" }).click(),
    ]);
    const files = unzipSync(new Uint8Array(await readFile(await archive.path())));
    assert.ok(files["profile_workloads.py"]);
    assert.ok(files["kernels/softmax.py"]);
    assert.ok(files["requirements.txt"]);
  });
});

test("documented edits give a meaningful comparison or an execution error", async (t) => {
  await runBrowser(t, { width: 1050, height: 900 }, async (page) => {
    const edits = [
      ["first-value", 0, "42", "73", /The output value differs/, "73"],
      ["vector-add", 1, "if i < n:", "if True:", /Execution error/, /a\[33\]/],
      ["grid-stride", 1, "cuda.gridDim.x * cuda.blockDim.x", "cuda.blockDim.x", /35 output values match/],
      ["reduction", 0, "    cuda.syncthreads()\n", "", /Execution error/, /scratch|shared:.*initialized/],
      ["histogram", 1, "cuda.atomic.add(counts, tokens[i], 1)", "counts[tokens[i]] += 1", /4 output values match/],
      ["scan", 0, "else 0\n        cuda.syncthreads()", "else 0", /values differ/],
      ["tiled-transpose", 0, "PADDING = 1", "PADDING = 0", /64 output values match/],
      ["softmax", 0, "math.exp(values[row, col] - row_max)", "math.exp(values[row, col])", /Execution error/, /math range error/],
    ];
    for (const [slug, caseIndex, before, after, message, evidence] of edits) {
      await openLesson(page, slug);
      if (lessons[slug].cases.length > 1) await page.locator("#case").selectOption(String(caseIndex));
      const editor = sourceEditor(page);
      const starter = await readSource(editor);
      assert.ok(starter.includes(before), slug);
      const edited = slug === "softmax" ? starter.replaceAll(before, after) : starter.replace(before, after);
      await replaceSource(page, editor, edited);
      await editor.press("Control+Enter");
      await page.locator("#run-status").filter({ hasText: message }).waitFor();
      if (evidence instanceof RegExp) {
        assert.match(await page.locator("#error-text").textContent(), evidence, slug);
        assert.equal(await page.locator("#result-panel").isVisible(), false);
      } else {
        assert.equal(await page.locator("#result-panel").isVisible(), true);
        if (evidence) assert.equal(await page.locator("#result-output tbody td").nth(1).textContent(), evidence);
      }
      await editorTools(page).click();
      await page.getByRole("button", { name: "Restore starter" }).click();
      assert.equal(await readSource(editor), starter);
    }
    await openLesson(page, "vector-add");
    await page.locator("#case").selectOption("0");
    await page.getByRole("button", { name: "Run kernel" }).click();
    await status(page, "success");
    await page.locator("#block").selectOption("1");
    await page.locator("#threads button[tabindex='0']").focus();
    await page.keyboard.press("ArrowRight");
    const nextThread = page.getByRole("button", { name: "Thread 1, no recorded events", exact: true });
    assert.equal(await nextThread.evaluate((button) => button === document.activeElement), true);
    assert.equal(await nextThread.getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByRole("heading", { name: "Selected thread trace" }).isVisible(), true);
  });
});

test("Python editor opens a saved draft, indents code, and runs the current buffer by keyboard", async (t) => {
  await runBrowser(t, { width: 1200, height: 900 }, async (page) => {
    const oldDraft = "from numba import cuda\n\n@cuda.jit\ndef kernel(out):\n    out[0] = 21\n";
    await page.evaluate((source) => {
      localStorage.setItem("cuda-python-lab-v1", JSON.stringify({ drafts: { "first-value": source } }));
    }, oldDraft);
    await page.reload();
    const editor = sourceEditor(page);
    assert.equal(await readSource(editor), oldDraft);
    assert.equal(await page.locator(".cm-lineNumbers .cm-gutterElement").getByText("4").count(), 1);

    await replaceSource(page, editor, oldDraft.split("\n").slice(0, 4).join("\n"));
    await editor.press("End");
    await editor.press("Enter");
    await page.keyboard.insertText("out[0] = 19");
    assert.match(await readSource(editor), /def kernel\(out\):\n    out\[0\] = 19$/);

    await editor.press("Control+z");
    assert.doesNotMatch(await readSource(editor), /out\[0\] = 19/);
    await editor.press("Control+y");
    assert.match(await readSource(editor), /out\[0\] = 19/);

    await editor.press("Control+Enter");
    await page.getByText("Edited kernel ran. The output value differs from the starter reference.").waitFor();
    assert.equal(await page.locator("#result-output tbody td").nth(1).textContent(), "19");

    await editor.press("Control+f");
    await page.locator(".cm-search input[name=search]").fill("kernel");
    await page.locator(".cm-search input[name=search]").press("Escape");
    await editor.press("Escape");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#run").evaluate((button) => button === document.activeElement), true);
  });
});

test("the V2-style tools export Python, show console output and allow a stopped run to restart", async (t) => {
  await runBrowser(t, { width: 390, height: 850 }, async (page) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    const root = page.locator("html");
    const editor = sourceEditor(page);
    await editor.waitFor();
    assert.equal(await root.getAttribute("data-theme"), "dark");
    await page.getByRole("button", { name: "Light theme" }).click();
    await page.reload();
    await editor.waitFor();
    assert.equal(await root.getAttribute("data-theme"), "light");

    await editorTools(page).click();
    await page.getByRole("button", { name: "Show launch settings" }).click();
    assert.equal(await page.locator("#input-panel").evaluate((panel) => panel.open), true);
    assert.match(await page.locator("#input-output").textContent(), /Blocks 1 · Threads per block 1/);
    await editorTools(page).click();
    await page.getByRole("button", { name: "Show target line" }).click();
    assert.equal(await editor.evaluate(() => String(window.getSelection())), "42");
    await page.keyboard.insertText("7 ** 2");
    await editor.press("Control+Enter");
    await page.locator("#run-status").filter({ hasText: "Edited kernel ran." }).waitFor();
    assert.equal(await page.locator("#result-output tbody td").nth(1).textContent(), "49");

    const starter = await readFile(new URL("../src/kernels/first-value.py", import.meta.url), "utf8");
    const printed = starter.replace("    out[0] = 42", '    out[0] = 7 ** 2\n    print("output", out[0])');
    await replaceSource(page, editor, printed);
    await page.getByRole("button", { name: "Run kernel" }).click();
    await page.locator("#console-output").waitFor();
    assert.equal(await page.locator("#console-output").textContent(), "output 49.0\n");
    assert.equal(await page.locator("#result-output tbody td").nth(1).textContent(), "49");

    await editorTools(page).click();
    const [sourceFile] = await Promise.all([
      page.waitForEvent("download"), page.getByRole("button", { name: "Export .py" }).click(),
    ]);
    assert.equal(sourceFile.suggestedFilename(), "first-value.py");
    assert.equal(await readFile(await sourceFile.path(), "utf8"), printed);
    await editorTools(page).click();

    await replaceSource(page, editor, starter.replace("    out[0] = 42", '    print("before the error")\n    raise ValueError("example")'));
    await editor.press("Control+Enter");
    await status(page, "failure");
    assert.equal(await page.locator("#console-output").textContent(), "before the error\n");
    await page.getByText("Python and execution messages", { exact: true }).click();
    assert.match(await page.locator("#error-details pre").textContent(), /first-value\.py.*ValueError: example/s);

    const loop = starter.replace("    out[0] = 42", "    while True:\n        pass");
    await replaceSource(page, editor, loop);
    await editor.press("Control+Enter");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.locator("#run-status").filter({ hasText: "Run stopped." }).waitFor();
    assert.equal(await readSource(editor), loop);
    assert.equal(await page.locator("#console-panel").isVisible(), false);

    await editorTools(page).click();
    await page.getByRole("button", { name: "Restore starter" }).click();
    await page.getByRole("button", { name: "Run kernel" }).click();
    await status(page, "success");
    assert.equal(await page.locator("#result-output tbody td").nth(1).textContent(), "42");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
});
