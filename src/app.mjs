import { lessons, modules } from "./course.mjs";
import { diagrams } from "./diagrams.mjs";
import { makeNotebook } from "./notebook.mjs";

const order = modules.flatMap((module) => module.lessons);
const main = document.querySelector("main");
const mobileNav = document.querySelector("#mobile-nav");
const mobile = matchMedia("(max-width: 850px)");
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

function setNavMode() {
  mobileNav.open = !mobile.matches;
}
mobile.addEventListener("change", setNavMode);
setNavMode();

function updateNav(page) {
  const completed = order.filter((slug) => state.completed[slug]).length;
  document.querySelector("#progress").max = order.length;
  document.querySelector("#progress").value = completed;
  document.querySelector("#progress-label").textContent = `${completed} / ${order.length}`;
  document.querySelector("#mobile-progress").textContent = `${completed} / ${order.length} complete`;
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
    <p class="lead">Learn GPU programming in Python without a physical GPU. In twelve browser labs, edit kernels, check their output, and trace what individual threads do.</p>
    <section class="reading course-start">
      <h2>Before you start</h2>
      <p>You’ll need to know how to read Python functions, loops, and array indices. The labs run Python in your browser with a teaching model of CUDA.</p>
      <p>For optional GPU runs, <a href="#gpu">Appendix A</a> shows how to run the kernels on an NVIDIA GPU and measure performance.</p>
      <a class="button primary standalone" href="${lessonURL(order[0])}">Start the first lab</a>
    </section>
    <div class="module-cards">
      ${modules.map((module) => `<section class="lesson-card">
        <h2>${escape(module.title)}</h2>
        <p>${escape(module.description)}</p>
        <ol start="${Number(number(module.lessons[0]))}">
          ${module.lessons.map((slug) => `<li>${lessonLink(slug)}</li>`).join("")}
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
    <p class="lead">Use a local or hosted NVIDIA GPU to compile the kernels, check their output, and measure performance.</p>
    <section class="reading">
      <h2>Open and run a lab notebook</h2>
      <ol>
        <li>In a lesson, open <strong>Optional GPU experiment and downloads</strong> and select <strong>Download notebook</strong>. The notebook contains your current code and the selected case. Start with the starter code to run the original NumPy check.</li>
        <li>Open the notebook in Jupyter on a machine with an NVIDIA GPU, or upload it to a hosted notebook service and enable an NVIDIA GPU runtime.</li>
        <li>Run the cells from top to bottom. The first cell installs the Python dependencies. If your notebook asks you to restart its Python session after installing, restart and continue with the next cell.</li>
        <li>Find the verification result before comparing <strong>Median kernel time</strong> and <strong>Median round-trip time</strong>. The kernel time uses GPU events. The round trip includes copies, launch, and waiting.</li>
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
    <details class="reading resource-details">
      <summary>Browser model and architecture simulator</summary>
      <p>The browser runs a small CUDA subset through Pyodide. It uses one fixed thread order within each barrier phase and reports logical accesses. Use GPU runs for native compilation and hardware measurements. A matching browser result cannot establish that a kernel is free of races.</p>
      <p>GPGPU-Sim is a separate open-source GPU architecture simulator. Its upstream guide covers setting up the simulator with a supported CUDA toolchain for architecture experiments.</p>
      <p><a href="https://github.com/gpgpu-sim/gpgpu-sim_distribution">GPGPU-Sim source and setup guide</a></p>
    </details>
  </div>`;
}

function syntaxLine(line, index) {
  const regex = /#[^\n]*|"[^"\n]*"|'[^'\n]*'|@\w+(?:\.\w+)*|\b(?:from|import|def|in|for|if|else|elif|while|return|and|or|not|True|False)\b|\b\d+(?:\.\d+)?\b|\b\w+(?=\()/g;
  let previous = 0;
  let text = "";
  for (const match of line.matchAll(regex)) {
    const [value] = match;
    const type = value.startsWith("#") ? "comment"
      : /^[\x22\x27]/.test(value) ? "string"
      : /^\d/.test(value) ? "number"
      : value.startsWith("@") || line[match.index + value.length] === "(" ? "call"
      : "keyword";
    text += escape(line.slice(previous, match.index)) + `<span class="token-${type}">${escape(value)}</span>`;
    previous = match.index + value.length;
  }
  text += escape(line.slice(previous));
  return `<span class="line" data-line="${index + 1}">${text || " "}</span>`;
}

function updateEditor() {
  model.highlight.innerHTML = model.editor.value.split("\n").map(syntaxLine).join("");
  syncScroll();
}
function syncScroll() {
  model.highlight.scrollTop = model.editor.scrollTop;
  model.highlight.scrollLeft = model.editor.scrollLeft;
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

function evidencePanel(lesson, name, title) {
  const contents = `<div id="${name}-output"></div>`;
  if (lesson.evidence.includes(name)) {
    return `<section id="${name}-panel" class="evidence" hidden><h3>${title}</h3>${contents}</section>`;
  }
  return `<details id="${name}-panel" class="evidence" hidden><summary>${title}</summary>${contents}</details>`;
}

function showLesson(slug) {
  const lesson = lessons[slug];
  const index = order.indexOf(slug);
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
      <p>The browser prepares the arrays and launch settings for each case.</p>
      <p id="saved-draft-note" hidden>A saved edit is open. <strong>Restore starter</strong> sets your draft aside. To get it back after experimenting, restore the starter again if needed, then select <strong>Undo restore</strong>.</p>
      <ol>${lesson.exercise.map((step) => `<li>${escape(step)}</li>`).join("")}</ol>
    </section>

    <section class="workbench" aria-labelledby="workbench-title">
      <div class="workbench-toolbar">
        <h2 id="workbench-title">Kernel workbench</h2>
        <label class="case-control" for="case" ${lesson.cases.length === 1 ? "hidden" : ""}>Case
          <select id="case">${lesson.cases.map(({ label }, i) => `<option value="${i}">${escape(label)}</option>`).join("")}</select>
        </label>
        <button class="button primary" id="run" type="button">Run kernel</button>
      </div>
      <div class="workbench-body">
        <div class="editor">
          <div class="editor-top">
            <span class="editor-title">${slug}.py</span>
            <button id="restore" type="button">Restore starter</button>
          </div>
          <div class="codebox">
            <pre id="highlight" aria-hidden="true"></pre>
            <textarea id="source" aria-label="Python kernel source" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>
          </div>
          <div class="editor-bottom">Ctrl/⌘ + Enter to run</div>
        </div>
        <div class="inspector">
          <div class="launch-info"><h3>Thread inspector</h3><span id="launch-shape"></span></div>
          <div class="inspect-controls"><label for="block">Block <select id="block"></select></label></div>
          <div class="thread-grid" id="threads" role="group" aria-label="Threads in selected block" aria-description="Use the arrow keys to select a thread."></div>
          <p class="inspector-note" id="inspector-note"></p>
          <div id="run-status" class="run-status" role="status"></div>
          <p id="error-text" class="error-text" hidden></p>
          <details id="error-details" hidden><summary>Python traceback</summary><pre></pre></details>
        </div>
      </div>
      <div class="workbench-output" id="workbench-output" hidden>
        <section id="result-panel" class="evidence"><h3>Output</h3><div id="result-output"></div></section>
        ${evidencePanel(lesson, "trace", "Selected thread trace")}
        ${evidencePanel(lesson, "warp", "Warp address model")}
        ${evidencePanel(lesson, "input", "Input values and launch arguments")}
      </div>
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
        <button id="download-source" class="button" type="button">Download kernel</button>
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
    slug, lesson, root: main.querySelector("article"), editor: find("source"), highlight: find("highlight"),
    input: find("case"), blockInput: find("block"), block: 0, thread: 0, result: null,
    request: 0, runButton: find("run"),
  };

  model.editor.value = state.drafts[slug] ?? starters[slug];
  find("saved-draft-note").hidden = model.editor.value === starters[slug];
  function updateRestore() {
    const undo = model.editor.value === starters[slug] && Object.hasOwn(state.restoredDrafts, slug);
    find("restore").textContent = undo ? "Undo restore" : "Restore starter";
    find("restore").hidden = !undo && model.editor.value === starters[slug];
  }
  function saveEditor(message) {
    state.drafts[slug] = model.editor.value;
    persist();
    updateRestore();
    updateEditor();
    invalidateRun(message);
  }
  updateEditor();
  updateRestore();
  model.editor.addEventListener("scroll", syncScroll);
  model.editor.addEventListener("input", () => {
    find("saved-draft-note").hidden = true;
    saveEditor("Code changed. Run the kernel to see the new output.");
  });
  model.editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!model.runButton.disabled) run();
    }
  });

  find("prediction").value = state.predictions[slug] ?? "";
  find("prediction").addEventListener("input", (event) => {
    state.predictions[slug] = event.target.value;
    persist();
  });

  find("restore").addEventListener("click", () => {
    find("saved-draft-note").hidden = true;
    if (model.editor.value === starters[slug] && Object.hasOwn(state.restoredDrafts, slug)) {
      model.editor.value = state.restoredDrafts[slug];
      delete state.restoredDrafts[slug];
      saveEditor("Your previous edit is back. Run the kernel to see its output.");
    } else if (model.editor.value !== starters[slug]) {
      state.restoredDrafts[slug] ??= model.editor.value;
      model.editor.value = starters[slug];
      saveEditor("Starter restored. Run the kernel to see its output.");
    }
  });

  model.input.value = lesson.cases[state.cases[slug]] ? state.cases[slug] : 0;
  function loadCase() {
    model.fixture = lesson.cases[Number(model.input.value)];
    state.cases[slug] = Number(model.input.value);
    model.block = 0;
    model.thread = 0;
    const { blocks, threads } = model.fixture;
    find("launch-shape").textContent = `Blocks ${shape(blocks)} · Threads per block ${shape(threads)}`;
    model.blockInput.innerHTML = Array.from({ length: launchCount(blocks) }, (_, i) =>
      `<option value="${i}">${coordinate(pairFor(i, blocks), blocks)}</option>`).join("");
    const buffers = Object.entries(model.fixture.buffers).filter(([name]) => name !== model.fixture.output);
    find("input-output").innerHTML = buffers.map(([name, spec]) =>
      `<p class="value-list"><strong>${escape(name)}</strong> · ${shape(spec.shape)} · ${escape(spec.dtype)}<br>${spec.values.map(pretty).join(", ")}</p>`).join("")
      + `<p class="value-list">Arguments · ${escape(model.fixture.args.map((name) => name in model.fixture.scalars
        ? `${name}=${model.fixture.scalars[name]}` : name).join(", "))}</p>`;
    invalidateRun();
  }
  model.input.addEventListener("change", () => {
    loadCase();
    persist();
  });
  model.blockInput.addEventListener("change", () => {
    model.block = Number(model.blockInput.value);
    model.thread = 0;
    renderThreadTrace();
  });

  find("threads").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-thread]");
    if (!button) return;
    model.thread = Number(button.dataset.thread);
    renderThreadTrace();
    find("threads").querySelector(`[data-thread="${model.thread}"]`).focus();
    const trace = find("trace-panel");
    if (model.result && trace instanceof HTMLDetailsElement) trace.open = true;
  });
  find("threads").addEventListener("keydown", (event) => {
    if (!event.target.matches("[data-thread]")) return;
    const columns = Math.min(model.fixture.threads[0], 8);
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
    if (typeof offset !== "number") return;
    event.preventDefault();
    const next = model.thread + offset;
    find("threads").querySelector(`[data-thread="${next}"]`)?.click();
  });
  model.runButton.addEventListener("click", run);
  find("download-notebook").addEventListener("click", () => {
    download(`${slug}.ipynb`, JSON.stringify(makeNotebook(lesson, model.editor.value, model.fixture, { edited: model.editor.value !== starters[slug] }), null, 2), "application/json");
  });
  find("download-source").addEventListener("click", () => {
    download(`${slug}.py`, model.editor.value, "text/x-python");
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

function invalidateRun(message = "") {
  model.request++;
  model.result = null;
  model.root.querySelector("#workbench-output").hidden = true;
  model.runButton.disabled = false;
  model.root.querySelector("#error-text").hidden = true;
  model.root.querySelector("#error-details").hidden = true;
  setStatus(message);
  renderThreadTrace();
  renderOutput();
}

function execute(source, fixture) {
  if (running) running.abort();
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
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    active.onerror = () => fail("Could not start the browser Python runtime. Reload the page and try again.");
    active.postMessage({ id, source, fixture });
  });
}

async function run() {
  const current = model;
  const request = ++current.request;
  current.runButton.disabled = true;
  current.result = null;
  current.root.querySelector("#workbench-output").hidden = true;
  current.root.querySelector("#error-text").hidden = true;
  current.root.querySelector("#error-details").hidden = true;
  const isCurrent = () => model === current && current.request === request;
  setStatus(worker ? "Running Python…" : "Loading Python and running the kernel…");
  renderThreadTrace();
  renderOutput();
  try {
    const result = await execute(current.editor.value, current.fixture);
    if (!isCurrent()) return;
    current.result = result;
    const differences = result.mismatches.length;
    const { length } = result.output;
    const count = `${length} output ${length === 1 ? "value" : "values"}`;
    const isStarter = current.editor.value === starters[current.slug];
    const comparison = length === 1
      ? `The output value ${differences ? "differs from" : "matches"} the starter reference.`
      : differences ? `${differences} of ${length} values differ from the starter reference.`
        : `All ${count} match the starter reference.`;
    if (isStarter) {
      setStatus(differences ? comparison : `Verified ${count} against the starter reference.`, differences ? "failure" : "success");
    } else {
      setStatus(`Edited kernel ran. ${comparison}`);
    }
    renderThreadTrace();
    renderOutput();
    current.root.querySelector("#workbench-output").hidden = false;
    current.root.querySelector("#input-panel").hidden = false;
  } catch (error) {
    if (!isCurrent()) return;
    setStatus("Execution error. The kernel did not produce output.", "failure");
    const detail = current.root.querySelector("#error-text");
    const lines = error.message.split("\n");
    detail.textContent = lines.at(-1);
    detail.hidden = false;
    const traceback = current.root.querySelector("#error-details");
    traceback.querySelector("pre").textContent = error.message;
    traceback.hidden = lines.length === 1;
    traceback.open = false;
  } finally {
    if (isCurrent()) current.runButton.disabled = false;
  }
}

function renderThreadTrace() {
  const { fixture, result, block, thread, root } = model;
  const { blocks, threads } = fixture;
  const events = (result?.events ?? []).filter((event) => linearIndex(event.block, blocks) === block);
  const activity = new Set(events.map((event) => linearIndex(event.thread, threads)));
  const threadName = (i) => coordinate(pairFor(i, threads), threads);
  const threadGrid = root.querySelector("#threads");
  const twoDimensional = threads.length > 1 && threads[1] > 1;
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
  root.querySelector("#trace-output").innerHTML = !result
    ? '<p class="trace-note">Run the kernel to inspect a thread.</p>'
    : (eventsForThread.length
      ? (eventsForThread.some((event) => event.space === "shared")
        ? '<p class="trace-note">Shared buffers use their allocation line as a name. Phase counts the barriers already crossed.</p>'
        : "")
      + formatTable(["Phase", "Action", "Space", "Buffer", "Index", "Word offset", "Value", "Shared bank"],
        eventsForThread.map((event) => [
          event.phase, event.action, event.space, event.buffer ?? "–", formatIndex(event.index ?? "–"),
          event.offset ?? "–", event.value === undefined ? "–" : pretty(event.value),
          event.space === "shared" ? event.offset % 32 : "–",
        ]))
      : '<p class="trace-note">The selected thread recorded no memory or barrier events.</p>')
      + (result.truncated ? '<p class="trace-note">The first 6,000 events are shown. The counters include every event.</p>' : "");

  const warp = Math.floor(thread / 32);
  const warpAccess = new Map();
  for (const event of events) {
    if (event.space !== "global" || Math.floor(linearIndex(event.thread, threads) / 32) !== warp) continue;
    const key = `${event.phase} · ${event.action} · ${event.buffer}`;
    if (!warpAccess.has(key)) warpAccess.set(key, { sectors: new Set(), count: 0 });
    const row = warpAccess.get(key);
    row.count++;
    row.sectors.add(Math.floor(event.offset / 8));
  }
  for (const name of ["trace", "warp"]) {
    root.querySelector(`#${name}-panel`).hidden = !result;
  }
  root.querySelector("#warp-output").innerHTML =
    `<p class="trace-note">Warp ${warp} of the selected block. The model assumes 32-byte-aligned array starts and four-byte elements. A sector contains eight words. Each row groups addresses by phase, action, and buffer.</p>`
    + (warpAccess.size ? formatTable(["Phase · action · buffer", "Accesses", "Distinct sectors", "Sector indices"],
      Array.from(warpAccess, ([key, { sectors, count }]) =>
        [key, count, sectors.size, [...sectors].sort((a, b) => a - b).join(", ")]))
      : '<p class="trace-note">The selected warp recorded no global accesses.</p>');
}

function renderOutput() {
  const { result, root, fixture } = model;
  const panel = root.querySelector("#result-output");
  if (!result) {
    panel.replaceChildren();
    return;
  }
  const labels = { global_read: "Global reads", global_write: "Global writes", shared_read: "Shared reads" };
  const differences = new Set(result.mismatches);
  const writers = new Map();
  for (const event of result.events) {
    if (event.space === "global" && event.buffer === fixture.output && event.action !== "read") {
      writers.set(event.offset, event);
    }
  }
  const rowTotals = model.slug === "softmax"
    ? Array.from({ length: result.shape[0] }, (_, row) => {
      const width = result.shape[1];
      const total = result.output.slice(row * width, (row + 1) * width)
        .reduce((sum, value) => sum + Number(value), 0);
      return `Row ${row}: ${pretty(total)}`;
    }).join(" · ") : "";
  const lessonCounters = {
    transfers: ["global_read", "global_write"],
    matmul: ["global_read", "shared_read"],
  };
  const counters = (lessonCounters[model.slug] ?? []).map((key) =>
    `<span>${labels[key]} ${result.counts[key] ?? 0}</span>`).join("");
  panel.innerHTML = `<p class="trace-note">Array ${escape(fixture.output)} · shape ${shape(result.shape)}</p>
    ${rowTotals ? `<p class="trace-note">Row sums · ${escape(rowTotals)}</p>` : ""}
    ${counters ? `<div class="trace-counters">${counters}</div>` : ""}`
    + formatTable(["Index", "Actual", "Starter reference", "Last traced writer"], result.output.map((value, i) => {
      const writer = writers.get(i);
      return [
        formatIndex(result.shape.length === 1 ? i : [Math.floor(i / result.shape[1]), i % result.shape[1]]),
        pretty(value), pretty(result.expected[i]),
        writer ? `Block ${coordinate(writer.block, fixture.blocks)} · thread ${coordinate(writer.thread, fixture.threads)}` : "–",
      ];
    }), result.output.map((_, i) => differences.has(i) ? "difference" : ""));
}

function route(moveFocus = false) {
  if (location.hash === "#main") return;
  const requested = location.hash.slice(1);
  const slug = requested.startsWith("lesson/") ? requested.slice(7) : requested;
  const page = slug === "course" || slug === "gpu" || order.includes(slug) ? slug : order[0];
  if (model && running) running.abort();
  model = null;
  updateNav(page);
  if (page === "course") showCourse();
  else if (page === "gpu") showGpu();
  else showLesson(page);
  document.title = page === "course" ? "CUDA Python Lab" : `${lessons[page]?.title ?? "Appendix A"} · CUDA Python Lab`;
  if (moveFocus) {
    if (mobile.matches) mobileNav.open = false;
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
