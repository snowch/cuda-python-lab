import { lessons, modules } from "./course.mjs";
import { diagrams } from "./diagrams.mjs";
import { mountKernelEditor } from "./editor.mjs";
import { makeNotebook } from "./notebook.mjs";

const order = modules.flatMap((module) => module.lessons);
const main = document.querySelector("main");
const courseNav = document.querySelector("#course-nav");
const storageKey = "cuda-python-lab-v1";
let starters;
let worker;
let running;
let jobId = 0;
let model;
let saved;

try {
  saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {};
} catch {
  saved = {};
}
const state = { drafts: {}, restoredDrafts: {}, predictions: {}, cases: {}, completed: {}, ...saved };
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // The workbench still functions when browser storage is unavailable.
  }
}

const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const pretty = (value) => typeof value === "number" && !Number.isInteger(value)
  ? Number(value.toPrecision(7)).toString()
  : String(value);
const formatIndex = (index) => Array.isArray(index) ? `(${index.join(", ")})` : String(index);
const shape = (dimensions) => dimensions.join(" × ");
const coordinate = (pair, dimensions) => dimensions.length === 1 ? String(pair[0]) : formatIndex(pair);
const number = (slug) => String(order.indexOf(slug) + 1).padStart(2, "0");
const lessonURL = (slug) => `#lesson/${slug}`;
const lessonLink = (slug) => `<a href="${lessonURL(slug)}">${escape(lessons[slug].title)}</a>`;
const launchCount = (dimensions) => dimensions.reduce((total, width) => total * width, 1);
const pairFor = (index, dimensions) => [index % dimensions[0], Math.floor(index / dimensions[0])];
const linearIndex = (pair, dimensions) => pair[1] * dimensions[0] + pair[0];

const themeControl = document.querySelector("#theme");
const prefersDark = matchMedia("(prefers-color-scheme: dark)");
let themeChoice;
try {
  themeChoice = localStorage.getItem("cuda-python-lab-theme");
} catch {
  // Theme selection is still available for this page.
}
function applyTheme() {
  const theme = themeChoice ?? (prefersDark.matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  themeControl.textContent = theme === "dark" ? "Light theme" : "Dark theme";
}
if (themeChoice !== "light" && themeChoice !== "dark") themeChoice = null;
applyTheme();
prefersDark.addEventListener("change", applyTheme);
themeControl.addEventListener("click", () => {
  themeChoice = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme();
  try {
    localStorage.setItem("cuda-python-lab-theme", themeChoice);
  } catch {
    // Keep the theme active until the page closes.
  }
});

function updateNav(page) {
  const completed = order.filter((slug) => state.completed[slug]).length;
  document.querySelector("#progress").max = order.length;
  document.querySelector("#progress").value = completed;
  document.querySelector("#course-progress").textContent = `${completed} / ${order.length} complete`;
  document.querySelectorAll("[data-page]").forEach((link) => {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelector("#lesson-nav").innerHTML = modules.map((module) => `
    <section class="nav-group">
      <h2>${escape(module.title)}</h2>
      <ul>${module.lessons.map((slug) => `
        <li><a class="lesson-link" href="${lessonURL(slug)}" ${page === slug ? 'aria-current="page"' : ""}>
          <span class="lesson-index">${number(slug)}</span>
          <span>${escape(lessons[slug].title)}</span>
          ${state.completed[slug] ? '<span class="lesson-done" aria-label="Complete">✓</span>' : ""}
        </a></li>`).join("")}
      </ul>
    </section>`).join("");
}

function showCourse() {
  main.innerHTML = `<div class="resource-page">
    <h1>CUDA Python Lab</h1>
    <p class="lead">Learn GPU programming in Python without a physical GPU. Edit functions that run on a GPU, check their output, and follow what individual threads do.</p>
    <section class="reading course-start">
      <h2>Before you start</h2>
      <p>You’ll need to know how to read Python functions, loops, and array indices. The browser runs your Python and models GPU behavior. Start with twelve core labs, then continue with five follow-up labs on memory access, precision, synchronization, and tuning.</p>
      <p>The browser labs cover kernel design and correctness. <a href="#gpu">Appendix A</a> explains GPU debugging and profiling and provides a hardware capstone.</p>
      <a class="button primary" href="${lessonURL(order[0])}">Start the first lab</a>
    </section>
    <div class="course-modules">
      ${modules.map((module) => `<section class="course-module">
        <h2>${escape(module.title)}</h2>
        <p>${escape(module.description)}</p>
        <ol start="${Number(number(module.lessons[0]))}">
          ${module.lessons.map((slug) => `<li>${lessonLink(slug)}<p>${escape(lessons[slug].summary)}</p></li>`).join("")}
        </ol>
      </section>`).join("")}
    </div>
    <p class="credit">Inspired by the predict, run, and explain activities in <a href="https://snowch.github.io/gpu-lab/v2/">GPU Lab</a>.</p>
  </div>`;
}

function showGpu() {
  main.innerHTML = `<div class="resource-page">
    <p class="breadcrumb"><a href="#course">Course outline</a></p>
    <h1 class="appendix-title">Appendix A. Run on an NVIDIA GPU</h1>
    <p class="lead">Use an NVIDIA GPU on your computer or through a hosted service. Run a notebook to check the output of your GPU function and measure how long it takes.</p>
    <section class="reading">
      <h2>Open and run a lab notebook</h2>
      <ol>
        <li>In a lesson, open <strong>Optional GPU experiment and downloads</strong> and select <strong>Download notebook</strong>. The notebook contains your current code and the selected case. Start with the original example to see whether its result matches the result calculated with NumPy.</li>
        <li>Open the notebook in Jupyter on a machine with an NVIDIA GPU, or upload it to a hosted notebook service and enable an NVIDIA GPU runtime.</li>
        <li>Run the cells from top to bottom. The first cell installs the Python dependencies. If the notebook asks for a Python restart, restart the session, then continue with the cell after the installation command.</li>
        <li>Find the output check before interpreting the timings. <strong>Median kernel time</strong> measures the function on the GPU using timestamps recorded by the GPU. <strong>Median round-trip time</strong> includes copying data to and from the GPU, starting the function, and waiting for the result.</li>
      </ol>
    </section>
    <section class="reading">
      <h2>Set up Python locally</h2>
      <p>Use Python 3.12 and an NVIDIA driver compatible with CUDA 12. Download <a href="./gpu/requirements.txt" download>requirements.txt</a>, open a terminal in its directory, and run these commands on a Linux machine with an NVIDIA GPU. Select the environment in Jupyter, or use it to run the scripts below.</p>
      <pre><code>python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt</code></pre>
      <p><a href="https://nvidia.github.io/numba-cuda/user/installation.html">Numba CUDA installation guide</a></p>
    </section>
    <section class="reading">
      <h2>Profile larger workloads on hardware</h2>
      <p><a href="./gpu/cuda-python-investigations.zip" download>Download the native investigations</a>, extract the archive, and open a terminal in the extracted directory. The included INVESTIGATIONS.md explains what to compare for each workload. For the softmax investigation, install a CUDA-enabled build of PyTorch for your GPU.</p>
      <pre><code>python profile_workloads.py affine --sizes 4096 1048576
python profile_workloads.py transpose --rows 2049 --cols 4093
python profile_workloads.py softmax --rows 4096 --cols 129</code></pre>
      <p>Check the output before interpreting timings. Record the GPU and input shape. Use Nsight Systems to see when copies and kernels run, or Nsight Compute to inspect kernel counters such as memory sectors.</p>
      <p><a href="https://pytorch.org/get-started/locally/">PyTorch installation selector</a> · <a href="https://developer.nvidia.com/nsight-systems">Nsight Systems</a> · <a href="https://developer.nvidia.com/nsight-compute">Nsight Compute</a></p>
    </section>
    <section class="reading">
      <h2>Find incorrect memory accesses and synchronization</h2>
      <p>In the extracted archive, open <strong>INVESTIGATIONS.md</strong> and follow the Compute Sanitizer exercise. Compare the reports from the faulty and corrected kernels. Memcheck checks invalid memory accesses, racecheck checks shared-memory hazards, and synccheck checks synchronization primitives.</p>
    </section>
    <section class="reading">
      <h2>Estimate how many blocks can run together</h2>
      <p>A streaming multiprocessor (SM) is the part of a GPU that runs thread blocks. A block is resident while it holds resources on an SM. Those resources include thread slots, registers (storage for each thread’s values), and shared memory. Occupancy is the fraction of the SM’s maximum number of warps that are resident.</p>
      <p>Use this example SM with 16 block slots, 2,048 thread slots, 65,536 registers, and 64 KiB (65,536 bytes) of shared memory. The model divides each budget by what one block needs. The smallest result limits the number of blocks. It assumes enough blocks to fill the SM and ignores hardware allocation increments.</p>
      <div class="lesson-card" id="launch-resources">
        <div class="actions">
          <div class="resource-control">
            <label for="resource-threads">Threads per block</label>
            <select id="resource-threads"><option>64</option><option>128</option><option>256</option><option>512</option></select>
          </div>
          <div class="resource-control">
            <label for="resource-registers">Registers per thread</label>
            <select id="resource-registers"><option>32</option><option selected>40</option><option>64</option></select>
          </div>
          <div class="resource-control">
            <label for="resource-shared">Shared memory per block (KiB)</label>
            <select id="resource-shared"><option>0</option><option selected>8</option><option>16</option><option>32</option></select>
          </div>
        </div>
        <p role="status" id="resource-result"></p>
        <div id="resource-limits"></div>
      </div>
      <p>With 40 registers per thread and 8 KiB per block, compare 64 and 256 threads per block. Which resource limits each launch? For 256 threads, change shared memory to 16 KiB. Check which limit changes. Use Nsight Compute to check occupancy and its limits on the actual GPU.</p>
    </section>
    <section class="reading">
      <h2>Profiling capstone. Compare two launches with a fused kernel</h2>
      <p>In <strong>INVESTIGATIONS.md</strong>, follow the capstone to predict, check, measure, and explain the effect of keeping an intermediate value within a thread. Use identical inputs and block sizes for each pair of timings.</p>
      <pre><code>python profile_workloads.py fusion --sizes 4096 1048583 4194304 --threads 64 128 256</code></pre>
      <p>Use the browser exercise to predict changes in array accesses. The GPU investigation supplies launch timings, register counts, and profiler evidence. Record the conditions for a conclusion that another developer can check.</p>
    </section>
    <details class="reading resource-details">
      <summary>Browser model and architecture simulator</summary>
      <p>Pyodide runs Python in the browser. The CUDA teaching model runs threads in one fixed order between synchronization points and records the array entries they access. Use a hardware run to compile the GPU code and measure its timing. A matching browser result does not establish that other thread orders on a GPU produce the same result.</p>
      <p>GPGPU-Sim is a separate open-source GPU architecture simulator. Its upstream guide covers setting up the simulator with a supported CUDA toolchain for architecture experiments.</p>
      <p><a href="https://github.com/gpgpu-sim/gpgpu-sim_distribution">GPGPU-Sim source and setup guide</a></p>
    </details>
  </div>`;
  const worksheet = main.querySelector("#launch-resources");
  function updateResources() {
    const threads = Number(worksheet.querySelector("#resource-threads").value);
    const registers = Number(worksheet.querySelector("#resource-registers").value);
    const shared = Number(worksheet.querySelector("#resource-shared").value);
    const limits = [
      ["Block slots", 16],
      ["Thread slots", Math.floor(2048 / threads)],
      ["Registers", Math.floor(65536 / (threads * registers))],
      ["Shared memory", shared ? Math.floor(64 / shared) : Infinity],
    ];
    const blocks = Math.min(...limits.map(([, limit]) => limit));
    const warps = blocks * threads / 32;
    worksheet.querySelector("#resource-result").textContent =
      `${blocks} resident blocks · ${warps} of 64 warps · ${Math.round(warps / 64 * 100)}% estimated occupancy`;
    worksheet.querySelector("#resource-limits").innerHTML = formatTable(["Resource", "Block limit"],
      limits.map(([resource, limit]) => [resource, limit === Infinity ? "No limit" : limit]));
  }
  worksheet.addEventListener("change", updateResources);
  updateResources();
}

function formatTable(headers, rows, classes = []) {
  return `<div class="table-scroll" tabindex="0"><table>
    <thead><tr>${headers.map((header) => `<th scope="col">${escape(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((values, i) => `<tr class="${classes[i] ?? ""}">${values.map((value) => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function setStatus(message, kind = "") {
  const status = model.root.querySelector("#run-status");
  status.textContent = message;
  status.className = `run-status ${kind}`;
}

function showLesson(slug) {
  const lesson = lessons[slug];
  const index = order.indexOf(slug);
  const firstLesson = index === 0;
  const hasTrace = lesson.evidence.includes("trace");
  const hasWarp = lesson.evidence.includes("warp");
  const module = modules.find((part) => part.lessons.includes(slug));
  main.innerHTML = `<article>
    <header class="lesson-heading">
      <p class="breadcrumb"><a href="#course">Course</a><span aria-hidden="true">/</span><span>${escape(module.title)}</span></p>
      <h1>${escape(lesson.title)}</h1>
      <p class="lead">${escape(lesson.summary)}</p>
      <div class="reading lesson-context">
        ${lesson.intro.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("")}
      </div>
    </header>

    <section class="prediction">
      <label for="prediction">Predict before you run</label>
      <p id="prediction-prompt">${escape(lesson.predict)}</p>
      <textarea id="prediction" rows="1" aria-describedby="prediction-prompt"></textarea>
    </section>

    <section class="reading experiment">
      <h2>Run the experiment</h2>
      ${firstLesson ? "" : "<p>Case selects the arrays and how many blocks and threads the browser starts. Edit the function in Python source to change what each thread does.</p>"}
      <p id="saved-draft-note" hidden>A saved edit is open. In <strong>Editor tools</strong>, <strong>Restore starter</strong> sets your draft aside. To get it back after experimenting, restore the starter again if needed, then select <strong>Undo restore</strong>.</p>
      <ol>${lesson.exercise.map((step) => `<li>${escape(step)}</li>`).join("")}</ol>
    </section>

    <section class="workbench" aria-labelledby="workbench-title">
      <div class="workbench-body">
        <section class="workbench-card editor" aria-labelledby="workbench-title">
          <div class="editor-top">
            <div><h2 id="workbench-title">Python source</h2><span class="editor-title">${slug}.py</span></div>
            <details id="editor-tools"><summary>Editor tools</summary>
              <div class="actions">
                <button class="button" id="show-target" type="button">Show target line</button>
                <button class="button" id="show-launch" type="button">${firstLesson ? "Show browser setup" : "Show launch settings"}</button>
                <button class="button" id="restore" type="button">Restore starter</button>
                <button class="button" id="undo-restore" type="button" hidden>Undo restore</button>
                <button class="button" id="download-source" type="button">Export .py</button>
              </div>
              <p class="trace-note" id="target-note" role="status" hidden></p>
            </details>
          </div>
          <div id="source" class="codebox"></div>
          <p class="editor-shortcuts" id="editor-shortcuts">Ctrl/⌘ + Enter to run · Esc then Tab to leave the editor</p>
          <div class="workbench-controls">
            <button class="button primary" id="run" type="button">Run kernel</button>
            <button class="button" id="stop" type="button" hidden>Stop</button>
            <label class="case-control" for="case" ${lesson.cases.length === 1 ? "hidden" : ""}>Case
              <select id="case">${lesson.cases.map(({ label }, i) => `<option value="${i}">${escape(label)}</option>`).join("")}</select>
            </label>
          </div>
        </section>
        <section class="workbench-card" aria-labelledby="console-title">
          <h2 id="console-title">Console</h2>
          <div id="run-status" class="run-status" role="status"></div>
          <pre id="console-output" tabindex="0" role="region" aria-label="Console transcript" hidden></pre>
          <details id="error-details" class="evidence" hidden><summary>Python traceback</summary><pre></pre></details>
          <details id="result-panel" class="evidence" hidden><summary>Compare with starter</summary><div id="result-output"></div></details>
          ${hasTrace ? `<div class="inspector">
            <div class="launch-info"><h3>Thread inspector</h3><span id="launch-shape"></span></div>
            <div class="inspect-controls"><label for="block">Block <select id="block"></select></label></div>
            <div class="thread-grid" id="threads" role="group" aria-label="Threads in selected block" aria-description="Use the arrow keys to select a thread."></div>
            <p class="inspector-note" id="inspector-note"></p>
          </div>` : ""}
          <details id="input-panel" class="evidence"><summary>${firstLesson ? "What the browser prepares" : "Input values and launch arguments"}</summary><div id="input-output"></div></details>
        </section>
      </div>
      ${hasTrace ? `<div class="workbench-output" id="workbench-output" hidden>
        <section class="evidence"><h3>Selected thread trace</h3><div id="trace-output"></div></section>
        ${hasWarp ? '<section class="evidence"><h3>Warp address model</h3><div id="warp-output"></div></section>' : ""}
      </div>` : ""}
    </section>

    <section class="reading lesson-explanation">
      <h2>Explain the result</h2>
      <p>${escape(lesson.explain)}</p>
      ${diagrams[slug] ?? ""}
    </section>

    <details class="lesson-card native-card">
      <summary>Optional GPU experiment and downloads</summary>
      <p>${escape(lesson.native)}</p>
      <div class="actions">
        <button id="download-notebook" class="button" type="button">Download notebook</button>
        <a class="button" href="#gpu">Appendix A</a>
      </div>
    </details>
    <footer class="lesson-footer">
      ${index > 0 ? `<span>Previous · ${lessonLink(order[index - 1])}</span>` : ""}
      <button type="button" id="complete" class="button complete">${state.completed[slug] ? "Completed ✓" : "Mark complete"}</button>
      ${index < order.length - 1 ? `<span>Next · ${lessonLink(order[index + 1])}</span>` : '<span><a href="#course">Course outline</a></span>'}
    </footer>
  </article>`;
  const find = (id) => main.querySelector(`#${id}`);
  model = {
    slug, lesson, root: main.querySelector("article"),
    input: find("case"), blockInput: find("block"), block: 0, thread: 0, result: null,
    request: 0, runButton: find("run"),
  };

  model.editor = mountKernelEditor(find("source"), state.drafts[slug] ?? starters[slug], {
    onEdit() {
      find("saved-draft-note").hidden = true;
      saveEditor("Code changed. Run the kernel to see the new output.");
    },
    onRun() {
      if (!model.runButton.disabled) run();
    },
  });
  find("saved-draft-note").hidden = model.editor.source === starters[slug];
  function updateRestore() {
    const isStarter = model.editor.source === starters[slug];
    find("restore").disabled = isStarter;
    find("undo-restore").hidden = !isStarter || !Object.hasOwn(state.restoredDrafts, slug);
  }
  function saveEditor(message) {
    state.drafts[slug] = model.editor.source;
    find("target-note").hidden = true;
    persist();
    updateRestore();
    invalidateRun(message);
  }
  updateRestore();

  find("prediction").value = state.predictions[slug] ?? "";
  find("prediction").addEventListener("input", (event) => {
    state.predictions[slug] = event.target.value;
    persist();
  });

  find("show-target").addEventListener("click", () => {
    if (model.editor.reveal(lesson.sourceTarget)) {
      find("editor-tools").open = false;
    } else {
      const note = find("target-note");
      note.textContent = "The original code for this step has changed in your draft.";
      note.hidden = false;
    }
  });
  find("show-launch").addEventListener("click", () => {
    find("editor-tools").open = false;
    const inputPanel = find("input-panel");
    inputPanel.open = true;
    inputPanel.querySelector("summary").focus();
  });
  find("restore").addEventListener("click", () => {
    state.restoredDrafts[slug] ??= model.editor.source;
    find("saved-draft-note").hidden = true;
    find("editor-tools").open = false;
    model.editor.reset(starters[slug]);
    saveEditor("Starter restored. Run the kernel to see its output.");
  });
  find("undo-restore").addEventListener("click", () => {
    const draft = state.restoredDrafts[slug];
    delete state.restoredDrafts[slug];
    find("editor-tools").open = false;
    model.editor.reset(draft);
    saveEditor("Your previous edit is back. Run the kernel to see its output.");
  });

  model.input.value = lesson.cases[state.cases[slug]] ? state.cases[slug] : 0;
  function loadCase() {
    model.fixture = lesson.cases[Number(model.input.value)];
    state.cases[slug] = Number(model.input.value);
    model.block = 0;
    model.thread = 0;
    const { blocks, threads } = model.fixture;
    if (hasTrace) {
      find("launch-shape").textContent = `Blocks ${shape(blocks)} · Threads per block ${shape(threads)}`;
      model.blockInput.innerHTML = Array.from({ length: launchCount(blocks) }, (_, i) =>
        `<option value="${i}">${coordinate(pairFor(i, blocks), blocks)}</option>`).join("");
    }
    if (firstLesson) {
      find("input-output").textContent = "The browser starts with out = [0] and runs the function once.";
    } else {
      const buffers = Object.entries(model.fixture.buffers).filter(([name]) => name !== model.fixture.output);
      find("input-output").innerHTML = buffers.map(([name, spec]) =>
        `<p class="value-list"><strong>${escape(name)}</strong> · shape ${shape(spec.shape)}<br>${spec.values.map(pretty).join(", ")}</p>`).join("")
        + `<p class="value-list">Blocks ${shape(blocks)} · Threads per block ${shape(threads)}</p>
          <p class="value-list">Arguments passed to kernel · ${escape(model.fixture.args.map((name) => name in model.fixture.scalars
            ? `${name}=${model.fixture.scalars[name]}` : name).join(", "))}</p>`;
    }
    invalidateRun();
  }
  model.input.addEventListener("change", () => {
    loadCase();
    persist();
  });
  model.blockInput?.addEventListener("change", () => {
    model.block = Number(model.blockInput.value);
    model.thread = 0;
    renderThreadTrace();
  });

  find("threads")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-thread]");
    if (!button) return;
    model.thread = Number(button.dataset.thread);
    renderThreadTrace();
    find("threads").querySelector(`[data-thread="${model.thread}"]`).focus();
  });
  find("threads")?.addEventListener("keydown", (event) => {
    if (!event.target.matches("[data-thread]")) return;
    const columns = Math.min(model.fixture.threads[0], 8);
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    if (typeof offset !== "number") return;
    event.preventDefault();
    const next = model.thread + offset;
    find("threads").querySelector(`[data-thread="${next}"]`)?.click();
  });
  model.runButton.addEventListener("click", run);
  find("stop").addEventListener("click", () => {
    invalidateRun("Run stopped. Your code is still in the editor.");
    model.runButton.focus();
  });
  find("download-notebook").addEventListener("click", () => {
    download(`${slug}.ipynb`, JSON.stringify(makeNotebook(lesson, model.editor.source, model.fixture, { edited: model.editor.source !== starters[slug] }), null, 2), "application/json");
  });
  find("download-source").addEventListener("click", () => {
    download(`${slug}.py`, model.editor.source, "text/x-python");
  });
  find("complete").addEventListener("click", (event) => {
    state.completed[slug] = !state.completed[slug];
    event.currentTarget.textContent = state.completed[slug] ? "Completed ✓" : "Mark complete";
    persist();
    updateNav(slug);
  });
  loadCase();
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = url;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderConsole(stdout = "", message = "") {
  const panel = model.root.querySelector("#console-output");
  const gap = stdout && message ? (stdout.endsWith("\n") ? "\n" : "\n\n") : "";
  panel.textContent = stdout + gap + message;
  panel.hidden = !stdout && !message;
}

function formatReadback({ output, shape, counts }, arrayName, slug, lesson) {
  const values = output.map(pretty);
  const matrixRows = shape.length === 2 ? Array.from({ length: shape[0] }, (_, row) => {
    const start = row * shape[1];
    return `  [${values.slice(start, start + shape[1]).join(", ")}]`;
  }) : null;
  const array = matrixRows ? `[\n${matrixRows.join(",\n")}\n]` : `[${values.join(", ")}]`;
  const lines = ["Kernel result", `${arrayName} = ${array}`];

  if (slug === "softmax") {
    const totals = Array.from({ length: shape[0] }, (_, row) => {
      const start = row * shape[1];
      return pretty(output.slice(start, start + shape[1]).reduce((sum, value) => sum + Number(value), 0));
    });
    lines.push(`Row sums [${totals.join(", ")}]`);
  }
  for (const [label, key] of lesson.consoleCounters ?? []) lines.push(`${label} ${counts[key] ?? 0}`);
  return lines.join("\n");
}

function setRunBusy(busy) {
  const stop = model.root.querySelector("#stop");
  const returnFocus = !busy && document.activeElement === stop;
  model.runButton.disabled = busy;
  stop.hidden = !busy;
  if (returnFocus) model.runButton.focus();
}

function invalidateRun(message = "") {
  model.request++;
  running?.abort();
  model.result = null;
  model.root.querySelector("#result-panel").hidden = true;
  model.root.querySelector("#error-details").hidden = true;
  setRunBusy(false);
  setStatus(message || "Run the kernel to see the result.");
  renderConsole();
  renderThreadTrace();
  renderComparison();
}

function execute(source, fixture, filename) {
  worker ??= new Worker(new URL("./worker.js", import.meta.url));
  const active = worker;
  const id = ++jobId;
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
      active.onmessage = null;
      active.onerror = null;
      running = null;
    }
    function fail(message) {
      cleanup();
      active.terminate();
      worker = null;
      reject(new Error(message));
    }
    const timer = setTimeout(() => fail("The run exceeded 15 seconds. Check loop bounds and try again."), 15000);
    running = { abort: () => fail("Run canceled.") };
    active.onmessage = (event) => {
      if (event.data.id !== id) return;
      cleanup();
      resolve(event.data);
    };
    active.onerror = () => fail("Could not start the browser Python runtime. Reload the page and try again.");
    active.postMessage({ id, source, fixture, filename });
  });
}

function showExecutionError(message, stdout) {
  setStatus("Execution error.", "failure");
  const lines = message.trimEnd().split("\n");
  renderConsole(stdout, lines.at(-1));
  const traceback = model.root.querySelector("#error-details");
  traceback.querySelector("pre").textContent = message;
  traceback.hidden = lines.length === 1;
  traceback.open = false;
}

async function run() {
  const current = model;
  invalidateRun();
  const request = current.request;
  setRunBusy(true);
  setStatus(worker ? "Running Python…" : "Loading Python and running the kernel…");
  const isCurrent = () => model === current && current.request === request;
  try {
    const source = current.editor.source;
    const { result, error, stdout } = await execute(source, current.fixture, `${current.slug}.py`);
    if (!isCurrent()) return;
    if (error) {
      showExecutionError(error, stdout);
      return;
    }
    current.result = result;
    const differences = result.mismatches.length;
    const { length } = result.output;
    const count = `${length} output ${length === 1 ? "value" : "values"}`;
    const isStarter = source === starters[current.slug];
    const comparison = length === 1
      ? `The output value ${differences ? "differs from" : "matches"} the starter reference.`
      : differences ? `${differences} of ${length} values differ from the starter reference.`
        : `All ${count} match the starter reference.`;
    if (isStarter) {
      setStatus(differences ? comparison : `Verified ${count} against the starter reference.`, differences ? "failure" : "success");
    } else {
      setStatus(`Edited kernel ran. ${comparison}`);
    }
    renderConsole(stdout, formatReadback(result, current.fixture.output, current.slug, current.lesson));
    renderThreadTrace();
    renderComparison();
    current.root.querySelector("#result-panel").hidden = false;
    if (current.lesson.evidence.includes("input")) current.root.querySelector("#input-panel").open = true;
  } catch (error) {
    if (isCurrent()) showExecutionError(error.message);
  } finally {
    if (isCurrent()) setRunBusy(false);
  }
}

function renderThreadTrace() {
  const { fixture, lesson, result, block, thread, root } = model;
  if (!lesson.evidence.includes("trace")) return;
  root.querySelector("#workbench-output").hidden = !result;
  const { blocks, threads } = fixture;
  const events = (result?.events ?? []).filter((event) => linearIndex(event.block, blocks) === block);
  const activity = new Set(events.map((event) => linearIndex(event.thread, threads)));
  const threadName = (i) => coordinate(pairFor(i, threads), threads);
  const threadGrid = root.querySelector("#threads");
  const twoDimensional = threads.length > 1;
  threadGrid.style.setProperty("--thread-columns", Math.min(threads[0], 8));
  threadGrid.style.setProperty("--thread-width", twoDimensional ? "40px" : "31px");
  threadGrid.innerHTML = Array.from({ length: launchCount(threads) }, (_, i) => `
    <button type="button" data-thread="${i}" tabindex="${i === thread ? 0 : -1}" aria-pressed="${i === thread}" aria-label="Thread ${threadName(i)}${result ? (activity.has(i) ? ", trace events" : ", no recorded events") : ""}"
      class="thread ${result ? (activity.has(i) ? "active" : "inactive") : ""}">${twoDimensional ? threadName(i).replaceAll(" ", "") : pairFor(i, threads)[0]}</button>`).join("");
  const eventsForThread = events.filter((event) => linearIndex(event.thread, threads) === thread);
  const threadLabel = `Block ${coordinate(pairFor(block, blocks), blocks)} · thread ${threadName(thread)}`;
  root.querySelector("#inspector-note").textContent = result
    ? `${threadLabel} · ${eventsForThread.length} recorded ${eventsForThread.length === 1 ? "event" : "events"}`
    : `${threadLabel} · Run the kernel to record events.`;
  if (!result) return;
  const details = lesson.traceDetails ?? [];
  const shared = details.includes("shared") || eventsForThread.some((event) => event.space !== "global");
  const offset = details.includes("offset");
  const bank = details.includes("bank");
  const headers = [...(shared ? ["Phase"] : []), "Action", ...(shared ? ["Memory"] : []), "Array", "Index",
    ...(offset ? ["Word offset"] : []), "Value", ...(bank ? ["Shared bank"] : [])];
  root.querySelector("#trace-output").innerHTML = (eventsForThread.length
    ? (shared ? '<p class="trace-note">A phase starts after the block passes a barrier. Shared arrays are named by the line that creates them (for example, shared:6).</p>' : "")
      + formatTable(headers, eventsForThread.map((event) => [
        ...(shared ? [event.phase] : []), event.action, ...(shared ? [event.space] : []),
        event.buffer ?? "–", formatIndex(event.index ?? "–"), ...(offset ? [event.offset ?? "–"] : []),
        event.value === undefined ? "–" : pretty(event.value),
        ...(bank ? [event.space === "shared" ? event.offset % 32 : "–"] : []),
      ]))
    : '<p class="trace-note">The browser recorded no events for the selected thread.</p>')
    + (result.truncated ? '<p class="trace-note">The first 6,000 events are shown. The counters include every event.</p>' : "");

  if (!lesson.evidence.includes("warp")) return;
  const warp = Math.floor(thread / 32);
  const warpAccess = new Map();
  const includePhase = events.some((event) => event.phase > 0);
  for (const event of events) {
    if (event.space !== "global" || Math.floor(linearIndex(event.thread, threads) / 32) !== warp) continue;
    const key = [includePhase ? event.phase : null, event.action, event.buffer].filter((value) => value !== null).join(" · ");
    if (!warpAccess.has(key)) warpAccess.set(key, { sectors: new Set(), count: 0 });
    const row = warpAccess.get(key);
    row.count++;
    row.sectors.add(Math.floor(event.offset / 8));
  }
  root.querySelector("#warp-output").innerHTML =
    `<p class="trace-note">Warp ${warp} of the selected block. Each sector holds eight four-byte values. The model counts different sectors for reads and writes to each array.</p>`
    + (warpAccess.size ? formatTable([includePhase ? "Phase · action · array" : "Action · array", "Accesses", "Distinct sectors", "Sector indices"],
      Array.from(warpAccess, ([key, { sectors, count }]) =>
        [key, count, sectors.size, [...sectors].sort((a, b) => a - b).join(", ")]))
      : '<p class="trace-note">The selected warp recorded no global accesses.</p>');
}

function renderComparison() {
  const { result, root, fixture, lesson } = model;
  const panel = root.querySelector("#result-output");
  if (!result) {
    panel.replaceChildren();
    return;
  }
  const differences = new Set(result.mismatches);
  const showWriter = lesson.evidence.includes("trace");
  const writers = new Map(result.events.filter((event) =>
    showWriter && event.space === "global" && event.buffer === fixture.output && event.action !== "read")
    .map((event) => [event.offset, event]));
  panel.innerHTML = formatTable(["Index", "Actual", "Starter reference", ...(showWriter ? ["Last traced writer"] : [])], result.output.map((value, i) => {
      const writer = writers.get(i);
      return [
        formatIndex(result.shape.length === 1 ? i : [Math.floor(i / result.shape[1]), i % result.shape[1]]),
        pretty(value), pretty(result.expected[i]),
        ...(showWriter ? [writer ? `Block ${coordinate(writer.block, fixture.blocks)} · thread ${coordinate(writer.thread, fixture.threads)}` : "–"] : []),
      ];
    }), result.output.map((_, i) => differences.has(i) ? "difference" : ""));
}

function route(moveFocus = false) {
  if (location.hash === "#main") return;
  const requested = location.hash.slice(1);
  const slug = requested.startsWith("lesson/") ? requested.slice(7) : requested;
  const page = slug === "course" || slug === "gpu" || order.includes(slug) ? slug : order[0];
  if (model && running) running.abort();
  model?.editor.destroy();
  model = null;
  updateNav(page);
  if (page === "course") showCourse();
  else if (page === "gpu") showGpu();
  else showLesson(page);
  document.title = page === "course" ? "CUDA Python Lab" : `${lessons[page]?.title ?? "Appendix A"} · CUDA Python Lab`;
  if (moveFocus) {
    courseNav.open = false;
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});

try {
  const response = await fetch("./starters.json");
  if (!response.ok) throw new Error("Could not load the starter kernels.");
  starters = await response.json();
  route();
  window.addEventListener("hashchange", () => route(true));
} catch (error) {
  main.textContent = error.message;
}
