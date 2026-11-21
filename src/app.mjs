import { lessons, modules } from "./course.mjs";
import { diagrams } from "./diagrams.mjs";
import { mountProgramEditor } from "./editor.mjs";
import { joinProgram, splitProgram, standaloneProgram } from "./host-program.mjs";
import { makeNotebook } from "./notebook.mjs";
import { walkthroughs } from "./walkthroughs.mjs";

const order = modules.flatMap((module) => module.lessons);
const main = document.querySelector("main");
const courseNav = document.querySelector("#course-nav");
const storageKey = "cuda-python-lab-v1";
let starters;
let activeEditor;
let saved;

try {
  saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") ?? {};
} catch {
  saved = {};
}
const state = { drafts: {}, restoredDrafts: {}, programs: {}, restoredPrograms: {}, predictions: {}, cases: {}, completed: {}, ...saved };
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // The workbench still functions when browser storage is unavailable.
  }
}

const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (slug) => String(order.indexOf(slug) + 1).padStart(2, "0");
const lessonURL = (slug) => `#lesson/${slug}`;
const lessonLink = (slug) => `<a href="${lessonURL(slug)}">${escape(lessons[slug].title)}</a>`;
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
    <p class="lead">Learn GPU programming with CUDA Python. Edit complete programs and run your experiments in a notebook on an NVIDIA GPU.</p>
    <section class="reading course-start">
      <h2>Before you start</h2>
      <p>You’ll need to know how to read Python functions, loops, and array indices. Use a local GPU with Jupyter or a hosted GPU runtime such as Google Colab. Diagrams and recordings show how CUDA maps your code to hardware.</p>
      <p>Start with twelve core labs, then continue with five follow-up labs on memory access, precision, synchronization, and tuning.</p>
      <p><a href="#gpu">Appendix A</a> covers notebook setup, debugging, and profiling.</p>
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
    <p class="credit">Inspired by the predict, run, and explain activities in <a href="https://snowch.github.io/cuda-cpp-lab/v2/">CUDA C++ Lab</a>.</p>
  </div>`;
}

function showGpu() {
  main.innerHTML = `<div class="resource-page">
    <p class="breadcrumb"><a href="#course">Course outline</a></p>
    <h1 class="appendix-title">Appendix A. Run on an NVIDIA GPU</h1>
    <p class="lead">Use an NVIDIA GPU on your computer or through a hosted notebook service. Start with the lab notebook, then use the investigations to measure and debug GPU work.</p>
    <section class="reading">
      <h2>Open and run a lab notebook</h2>
      <ol>
        <li>In a lesson, choose <strong>Download notebook</strong>. It contains the complete program in your editor and the expected result for the selected starter case.</li>
        <li>Open the file in Jupyter on a machine with an NVIDIA GPU, or upload it to <a href="https://colab.research.google.com/">Google Colab</a>. In Colab, choose <strong>Runtime → Change runtime type</strong>, select a GPU, and save.</li>
        <li>Run the cells from top to bottom. The first cell installs the Python dependencies. If the notebook asks for a Python restart, restart the session, then continue with the cell after the installation command.</li>
        <li>Read the output under <strong>Run the program</strong>. <strong>Check the output</strong> compares the returned array with the selected starter case. Make the next edit in the program cell and rerun it.</li>
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
      <p>Use the fusion lab to predict changes in array accesses. The GPU investigation supplies launch timings, register counts, and profiler evidence. Record the conditions for a conclusion that another developer can check.</p>
    </section>
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

function formatTable(headers, rows) {
  return `<div class="table-scroll" tabindex="0"><table>
    <thead><tr>${headers.map((header) => `<th scope="col">${escape(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((values) => `<tr>${values.map((value) => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function showLesson(slug) {
  const lesson = lessons[slug];
  const index = order.indexOf(slug);
  const walkthrough = walkthroughs[slug];
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
      <p>${lesson.cases.length > 1 ? "Select a case in the editor and download its notebook." : "Download the notebook from the editor."} Open it in <a href="https://colab.research.google.com/">Google Colab</a> or Jupyter with an NVIDIA GPU. Run its cells from top to bottom. <a href="#gpu">GPU setup instructions</a></p>
      <ol>${lesson.exercise.map((step) => `<li>${escape(step)}</li>`).join("")}</ol>
    </section>

    <section class="workbench" aria-labelledby="workbench-title">
      <div class="workbench-card">
        <div class="editor-top">
          <div><h2 id="workbench-title">Python source</h2><span class="editor-title">${slug}.py</span></div>
          <details id="editor-tools"><summary>Editor tools</summary>
            <div class="actions">
              <button class="button" id="show-target" type="button">Show target line</button>
              <button class="button" id="show-main" type="button">Show main()</button>
              <button class="button" id="restore" type="button">Restore starter</button>
              <button class="button" id="undo-restore" type="button" hidden>Undo restore</button>
              <button class="button" id="download-source" type="button">Export .py</button>
            </div>
            <p class="editor-note" id="target-note" role="status" hidden></p>
          </details>
        </div>
        <div id="source" class="codebox"></div>
        <p class="editor-shortcuts" id="editor-shortcuts">Esc then Tab to leave the editor</p>
        <div class="workbench-controls">
          <label class="case-control" for="case" ${lesson.cases.length === 1 ? "hidden" : ""}>Case
            <select id="case" ${lesson.cases.length > 1 ? 'aria-describedby="case-note"' : ""}>${lesson.cases.map(({ label }, i) => `<option value="${i}">${escape(label)}</option>`).join("")}</select>
          </label>
          <button class="button primary" id="download-notebook" type="button">Download notebook</button>
        </div>
        ${lesson.cases.length > 1 ? '<p class="editor-note" id="case-note">Kernel edits carry across cases. The host code has a draft for each case.</p>' : ""}
        <p class="editor-note" id="draft-note" role="status" hidden></p>
      </div>
    </section>

    <section class="reading lesson-explanation">
      <h2>Explain the result</h2>
      <p>${escape(lesson.explain)}</p>
      ${diagrams[slug] ?? ""}
      ${walkthrough ? `<details id="walkthrough" class="walkthrough resource-details">
        <summary>Video · ${escape(walkthrough.title)}</summary>
        <video controls playsinline preload="none" width="960" height="540" aria-label="${escape(walkthrough.title)}" poster="./media/${slug}/poster.webp">
          <source src="./media/${slug}/walkthrough.mp4" type="video/mp4">
          <track src="./media/${slug}/captions.vtt" kind="captions" srclang="en" label="English" default>
        </video>
        <details class="walkthrough-transcript"><summary>Read the transcript</summary>
          ${walkthrough.stages.map(({ title, narration }) => `<h3>${escape(title)}</h3><p>${escape(narration)}</p>`).join("")}
        </details>
      </details>` : ""}
    </section>

    <details class="native-card">
      <summary>Further GPU investigation</summary>
      <p>${escape(lesson.native)}</p>
      <p><a href="#gpu">Appendix A · GPU setup and tools</a></p>
    </details>
    <footer class="lesson-footer">
      ${index > 0 ? `<span>Previous · ${lessonLink(order[index - 1])}</span>` : ""}
      <button type="button" id="complete" class="button complete">${state.completed[slug] ? "Completed ✓" : "Mark complete"}</button>
      ${index < order.length - 1 ? `<span>Next · ${lessonLink(order[index + 1])}</span>` : '<span><a href="#course">Course outline</a></span>'}
    </footer>
  </article>`;
  const find = (id) => main.querySelector(`#${id}`);
  find("walkthrough")?.addEventListener("toggle", ({ currentTarget }) => {
    if (!currentTarget.open) currentTarget.querySelector("video").pause();
  });
  const input = find("case");
  const draftNote = find("draft-note");
  const targetNote = find("target-note");
  const programDrafts = state.programs[slug] ??= {};
  const restoredPrograms = state.restoredPrograms[slug] ??= {};
  input.value = lesson.cases[state.cases[slug]] ? state.cases[slug] : 0;
  let caseIndex = Number(input.value);
  let fixture = lesson.cases[caseIndex];
  let starter = standaloneProgram(starters[slug], fixture);

  function caseSource() {
    const kernel = state.drafts[slug] ?? starters[slug];
    const previous = programDrafts[caseIndex];
    if (previous === undefined) return standaloneProgram(kernel, fixture);
    const parts = splitProgram(previous);
    return parts && parts.kernel.trimEnd() !== kernel.trimEnd() ? joinProgram(kernel, parts.host) : previous;
  }

  function restoredSource() {
    const legacyKernel = state.restoredDrafts[slug];
    return restoredPrograms[caseIndex] ?? (legacyKernel === undefined ? undefined : standaloneProgram(legacyKernel, fixture));
  }

  function updateRestore(message = "") {
    const isStarter = editor.source === starter;
    find("restore").disabled = isStarter;
    find("undo-restore").hidden = !isStarter || restoredSource() === undefined;
    draftNote.textContent = message;
    draftNote.hidden = !message;
    targetNote.hidden = true;
  }

  function saveEditor(message) {
    const source = editor.source;
    const parts = splitProgram(source);
    if (parts) state.drafts[slug] = parts.kernel;
    programDrafts[caseIndex] = source;
    persist();
    updateRestore(message);
  }

  const editor = mountProgramEditor(find("source"), caseSource(), () => saveEditor());
  activeEditor = editor;
  updateRestore(editor.source === starter ? "" : "A saved edit is open.");

  find("prediction").value = state.predictions[slug] ?? "";
  find("prediction").addEventListener("input", (event) => {
    state.predictions[slug] = event.target.value;
    persist();
  });

  function showLine(text, options) {
    if (editor.reveal(text, options)) {
      find("editor-tools").open = false;
    } else {
      targetNote.textContent = "That line has changed in your draft.";
      targetNote.hidden = false;
    }
  }

  find("show-target").addEventListener("click", () => showLine(lesson.sourceTarget));
  find("show-main").addEventListener("click", () => showLine("def main(", { align: "start" }));
  find("restore").addEventListener("click", () => {
    restoredPrograms[caseIndex] = editor.source;
    find("editor-tools").open = false;
    editor.reset(starter);
    saveEditor("The starter is open. Use Undo restore in Editor tools to recover your edit.");
  });
  find("undo-restore").addEventListener("click", () => {
    const source = restoredSource();
    if (Object.hasOwn(restoredPrograms, caseIndex)) delete restoredPrograms[caseIndex];
    else delete state.restoredDrafts[slug];
    find("editor-tools").open = false;
    editor.reset(source);
    saveEditor("Your previous edit is open.");
  });

  input.addEventListener("change", () => {
    caseIndex = Number(input.value);
    fixture = lesson.cases[caseIndex];
    starter = standaloneProgram(starters[slug], fixture);
    state.cases[slug] = caseIndex;
    editor.reset(caseSource(), { focus: false });
    updateRestore(editor.source === starter ? "" : "A saved edit is open.");
    persist();
  });

  find("download-notebook").addEventListener("click", () => {
    const source = editor.source;
    const notebook = makeNotebook(lesson, source, fixture);
    download(`${slug}.ipynb`, JSON.stringify(notebook, null, 2), "application/json");
  });
  find("download-source").addEventListener("click", () => {
    download(`${slug}.py`, editor.source, "text/x-python");
  });
  find("complete").addEventListener("click", () => {
    state.completed[slug] = !state.completed[slug];
    find("complete").textContent = state.completed[slug] ? "Completed ✓" : "Mark complete";
    persist();
    updateNav(slug);
  });
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = url;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function route(moveFocus = false) {
  if (location.hash === "#main") return;
  const requested = location.hash.slice(1);
  const slug = requested.startsWith("lesson/") ? requested.slice(7) : requested;
  const page = slug === "course" || slug === "gpu" || order.includes(slug) ? slug : order[0];
  activeEditor?.destroy();
  activeEditor = null;
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
