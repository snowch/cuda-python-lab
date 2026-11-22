import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { unzipSync } from "fflate";
import { lessons } from "../src/course.mjs";
import { standaloneProgram } from "../src/host-program.mjs";
import { walkthroughs } from "../src/walkthroughs.mjs";

import { launchChromium, serveBuild } from "./browser-support.mjs";

async function runBrowser(t, viewport, exercise) {
  const url = await serveBuild(t);
  const browser = await launchChromium(t);
  const page = await browser.newPage({ viewport, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await exercise(page);
  assert.deepEqual(errors, []);
}

const sourceEditor = (page) => page.getByRole("textbox", { name: "Python program source" });
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

async function replaceSource(page, editor, program) {
  await editor.press("ControlOrMeta+a");
  await page.keyboard.insertText(program);
}

async function downloadFile(page, locator) {
  const [download] = await Promise.all([page.waitForEvent("download"), locator.click()]);
  return { name: download.suggestedFilename(), contents: await readFile(await download.path()) };
}

test("every case exports a CUDA notebook containing its complete program", async (t) => {
  await runBrowser(t, { width: 1200, height: 900 }, async (page) => {
    for (const [slug, lesson] of Object.entries(lessons)) {
      await openLesson(page, slug);
      assert.ok(await page.getByRole("button", { name: "Run", exact: true }).isVisible());
      const kernel = await readFile(new URL(`../src/kernels/${slug}.py`, import.meta.url), "utf8");
      const starter = standaloneProgram(kernel, lesson.cases[0]);
      const excerpts = await page.locator(".lesson-excerpt code").allTextContents();
      assert.ok(excerpts.length > 0, slug);
      for (const excerpt of excerpts) {
        const lines = excerpt.split("\n");
        const firstLine = starter.split("\n").find((line) => line.trimStart() === lines[0]);
        assert.ok(firstLine, slug);
        const indent = firstLine.match(/^ */)[0];
        assert.ok(starter.includes(lines.map((line) => line && indent + line).join("\n")), slug);
      }
      for (const [index, fixture] of lesson.cases.entries()) {
        if (lesson.cases.length > 1) await page.getByRole("combobox", { name: "Case", exact: true }).selectOption(String(index));
        const file = await downloadFile(page, page.getByRole("button", { name: "Download notebook" }));
        const notebook = JSON.parse(file.contents);
        assert.equal(file.name, `${slug}.ipynb`);
        assert.equal(notebook.metadata.accelerator, "GPU");
        assert.ok(notebook.cells[0].source.includes(fixture.label), slug);
        const program = notebook.cells.find((cell) => cell.cell_type === "code" && cell.source.includes("def main():"));
        assert.equal(program.source, standaloneProgram(kernel, fixture), slug);
      }
    }
  });
});

test("the full first program is keyboard accessible and edits reach both exports", async (t) => {
  await runBrowser(t, { width: 390, height: 850 }, async (page) => {
    const editor = sourceEditor(page);
    const starter = await readSource(editor);
    assert.match(starter, /kernel\[1, 1\]\(out\)\n    result = out\.copy_to_host\(\)/);
    await editorTools(page).press("Space");
    await page.getByRole("button", { name: "Show main()" }).press("Enter");
    assert.equal(await editor.evaluate(() => String(window.getSelection())), "def main(");

    const edited = starter.replace("out[0] = 42", "out[0] = 73")
      .replace("    return result", "    print(out_host.tolist())\n    return result");
    await replaceSource(page, editor, edited);
    assert.match(await page.locator(".lesson-excerpt code").nth(1).textContent(), /out\[0\] = 42/);
    await editor.press("Escape");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#run").evaluate((button) => button === document.activeElement), true);
    const file = await downloadFile(page, page.getByRole("button", { name: "Download notebook" }));
    assert.ok(JSON.parse(file.contents).cells.some((cell) => cell.source === edited));
    await editorTools(page).click();
    const script = await downloadFile(page, page.getByRole("button", { name: "Export .py" }));
    assert.equal(script.name, "first-value.py");
    assert.equal(script.contents.toString(), edited);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
});

test("case changes preserve the shared kernel and the host draft for each case", async (t) => {
  await runBrowser(t, { width: 390, height: 850 }, async (page) => {
    await openLesson(page, "vector-add");
    const input = page.getByRole("combobox", { name: "Case", exact: true });
    const editor = sourceEditor(page);
    const first = await readSource(editor);
    const edited = first.replace("a[i] + b[i]", "a[i] - b[i]").replace("kernel[2, 32]", "kernel[3, 16]");
    await replaceSource(page, editor, edited);
    await input.selectOption("2");
    const next = await readSource(editor);
    assert.match(next, /a\[i\] - b\[i\]/);
    assert.match(next, /kernel\[1, 32\]\(a, b, out, 32\)/);
    assert.doesNotMatch(next, /kernel\[3, 16\]/);

    const newKernel = next.replace("a[i] - b[i]", "a[i] * b[i]");
    await replaceSource(page, editor, newKernel);
    await input.selectOption("0");
    const final = await readSource(editor);
    assert.match(final, /a\[i\] \* b\[i\]/);
    assert.match(final, /kernel\[3, 16\]\(a, b, out, 33\)/);

    await page.getByRole("textbox", { name: "Predict before you run" }).fill("Block 2, Thread 0");
    await page.getByRole("button", { name: "Mark complete" }).click();
    await editorTools(page).click();
    await page.getByRole("button", { name: "Restore starter" }).click();
    assert.equal(await readSource(editor), first);
    await page.reload();
    await editorTools(page).click();
    await page.getByRole("button", { name: "Undo restore" }).click();
    assert.equal(await readSource(editor), final);
    assert.equal(await input.inputValue(), "0");
    assert.equal(await page.getByRole("textbox", { name: "Predict before you run" }).inputValue(), "Block 2, Thread 0");
    await page.getByRole("button", { name: "Completed" }).waitFor();
  });
});

test("kernel-only drafts reopen with main and can still be restored", async (t) => {
  await runBrowser(t, { width: 1200, height: 900 }, async (page) => {
    const oldDraft = "from numba import cuda\n\n@cuda.jit\ndef kernel(out):\n    out[0] = 21\n";
    await page.evaluate((source) => {
      localStorage.setItem("cuda-python-lab-v1", JSON.stringify({ drafts: { "first-value": source } }));
    }, oldDraft);
    await page.reload();
    const editor = sourceEditor(page);
    const source = await readSource(editor);
    assert.ok(source.startsWith(oldDraft));
    assert.match(source, /def main\(\):/);
    await editorTools(page).click();
    await page.getByRole("button", { name: "Restore starter" }).click();
    assert.match(await readSource(editor), /out\[0\] = 42/);
    await editorTools(page).click();
    await page.getByRole("button", { name: "Undo restore" }).click();
    assert.equal(await readSource(editor), source);
  });
});

test("architecture walkthroughs play with captions and expose transcripts by keyboard", async (t) => {
  await runBrowser(t, { width: 390, height: 850 }, async (page) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.locator("html[data-theme=dark]").waitFor();
    for (const [slug, walkthrough] of Object.entries(walkthroughs)) {
      await openLesson(page, slug);
      await page.locator(".walkthrough > summary").press("Space");
      const video = page.locator(".walkthrough video");
      assert.equal(await video.getAttribute("aria-label"), walkthrough.title);
      await video.evaluate(async (player) => {
        player.muted = true;
        await player.play();
      });
      await page.waitForFunction(() => {
        const player = document.querySelector(".walkthrough video");
        return player.currentTime > 0 && player.textTracks[0]?.cues?.length > 0;
      });
      assert.ok(await video.evaluate((player) => player.duration > 20));
      await video.evaluate((player) => player.pause());
      await page.locator(".walkthrough-transcript > summary").press("Space");
      for (const stage of walkthrough.stages) {
        assert.ok(await page.getByRole("heading", { name: stage.title, exact: true }).isVisible(), slug);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, slug);
    }
  });
});

test("the GPU appendix gives notebook setup, investigations and the occupancy worksheet", async (t) => {
  await runBrowser(t, { width: 1200, height: 900 }, async (page) => {
    await page.getByRole("link", { name: "GPU setup instructions" }).click();
    await page.getByRole("heading", { name: "Open and run a lab notebook" }).waitFor();
    assert.ok(await page.getByRole("link", { name: "Google Colab" }).isVisible());
    const archive = await downloadFile(page, page.getByRole("link", { name: "Download the native investigations" }));
    const files = unzipSync(new Uint8Array(archive.contents));
    assert.ok(files["profile_workloads.py"]);
    assert.ok(files["kernels/softmax.py"]);
    assert.ok(files["requirements.txt"]);
    assert.ok(files["debug_workloads.py"]);
    assert.match(new TextDecoder().decode(files["INVESTIGATIONS.md"]), /Profiling capstone/);
    assert.match(await page.locator("#resource-result").textContent(), /8 resident blocks · 16 of 64 warps · 25%/);
    await page.getByLabel("Threads per block", { exact: true }).selectOption("256");
    assert.match(await page.locator("#resource-result").textContent(), /6 resident blocks · 48 of 64 warps · 75%/);
  });
});
