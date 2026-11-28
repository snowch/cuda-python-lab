import {materialSymbol} from "./material-symbols.mjs";
import {homeArchitecture} from "./home-architecture.mjs";
import {resourceSummary,lessonReferences,hardwareLocation,durationLabel} from "./lesson-resources.mjs";
import {mediaDurations} from "./media-durations.mjs";
import { compilerLabHTML, compilerNotebook } from "./compiler-lab.mjs";
import { migrateCudaImports } from "./source-migration.mjs";
import {mountSavedReview} from "./saved-version.mjs";
import {openLearnerWork, workKey} from "./learner-work.mjs";
import { registerReadingState, savedReadingState, legacyReadingWork, clearLegacyReadingWork, restoreReadingState } from "./experiment-state.mjs";
import { lessons, modules } from "./course.mjs";
import { diagrams } from "./diagrams.mjs";
import { mountProgramEditor } from "./editor.mjs";
import { joinProgram, programExcerpt, splitProgram, standaloneProgram } from "./host-program.mjs";
import { makeNotebook } from "./notebook.mjs";
import { walkthroughs } from "./walkthroughs.mjs";
import { attachRunner } from "./browser-runner.mjs";

const order = modules.flatMap((module) => module.lessons);
const main = document.querySelector("main");
const courseNav = document.querySelector("#course-nav");
const courseNavigation = document.querySelector(".course-navigation");
const courseContents = document.querySelector("#course-contents");
courseNavigation.append(courseContents);
const syncCourseNav = () => { courseContents.hidden = !courseNav.open; };
syncCourseNav();
courseNav.addEventListener("toggle", syncCourseNav);
courseContents.addEventListener('click',event=>{
  const link=event.target.closest('a');
  if(link?.hash!==location.hash)return;
  event.preventDefault();courseNav.open=false;syncCourseNav();
  main.focus({preventScroll:true});window.scrollTo(0,0);
});
courseNavigation.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !courseNav.open) return;
  courseNav.open = false;
  syncCourseNav();
  const trigger = courseNav.querySelector("summary");
  trigger.focus({ preventScroll: true });
  const bounds = trigger.getBoundingClientRect();
  const header = document.querySelector(".site-header").getBoundingClientRect().bottom;
  if (bounds.top < header || bounds.bottom > innerHeight)
    scrollTo({ top: scrollY + bounds.top - header - 12, behavior: "instant" });
  event.preventDefault();
});
let starters;
let activeEditor;
let activeRunner;
let activePage;
let lessonView;
const work = openLearnerWork(updateSaveStatus);
const state = work.state;
const workPanel = document.createElement('section');
workPanel.className = 'work-save';
workPanel.setAttribute('aria-label','Learner work');
workPanel.innerHTML = `<p id="work-status" tabindex="-1"></p>
  <div id="work-actions" hidden><button type="button" class="button" id="retry-save">Retry save</button>
  <button type="button" class="button" id="export-work">Export learner work</button></div>
  <details id="work-copies" hidden><summary>Review recovery copies</summary>
  <label>Saved version <select id="work-version"></select></label>
  <p id="work-copy-help"></p>
  <label>Copy contents <textarea id="work-copy-text" aria-describedby="work-copy-help" readonly rows="5"></textarea></label>
  <button type="button" class="button" id="remove-copy">Remove this recovery copy</button></details>
  <span class="work-announcement" role="status"></span>`;
const control = id => workPanel.querySelector('#'+id);
const versions = control('work-version');
const latestReview = mountSavedReview(workPanel, work, () => lessonView);
function versionLabel(copy) {
  const [field, slug, index] = copy.path;
  const kind = {legacy:'Saved collection', drafts:'Kernel', programs:'Program', predictions:'Prediction', restoredPrograms:'Undo restore', restoredDrafts:'Undo kernel restore', results:'Run result'};
  const lesson = lessons[slug];
  const parts = [kind[field] ?? field, lesson?.title ?? slug, lesson?.cases[index]?.label, new Date(copy.savedAt).toLocaleString()];
  return parts.filter(Boolean).join(' · ');
}
function displayCopy() {
  const copy = work.copies.find(c => c.id === versions.value);
  if (!copy) return;
  const [field, slug, index] = copy.path;
  const lesson = lessons[slug];
  const where = [lesson?.title ?? slug, lesson?.cases[index]?.label].filter(Boolean).join(' · ');
  const actions = {
    predictions:'Paste this answer into the prediction box.',
    drafts:'Replace the kernel above “# Host code” in the editor.',
    restoredDrafts:'Replace the kernel above “# Host code” in the editor.',
    legacy:'Choose Export learner work to keep the complete earlier collection as JSON.',
    results:'Choose Export learner work to keep this run’s source, output and PTX.',
    programs:'Paste this complete program into the editor.',
    restoredPrograms:'Paste this complete program into the editor.',
  };
  control('work-copy-help').textContent = where + '. ' + (actions[field] ?? 'Export learner work to keep this copy.');
  control('work-copy-text').value = typeof copy.value === 'string' ? copy.value : JSON.stringify(copy.value,null,2);
}
function warnUnload(event) { event.preventDefault(); event.returnValue = ''; }
function updateSaveStatus() {
  const failed = Boolean(work.error);
  const conflict = work.copies.length > 0;
  const focused = document.activeElement;
  const stale = latestReview.update();
  const failure = work.error.startsWith('Recovery copies are full') ? work.error
    : 'Learner work could not be saved. ' + work.error + ' Keep this tab open. Export your work or retry.';
  const message = failed ? failure : work.saving ? 'Saving learner work…'
    : stale ? stale : conflict ? 'Learner work saved. Recovery copies are available for overlapping edits.'
    : work.saved ? 'Learner work saved in this browser.' : 'No edits to save yet.';
  control('work-status').textContent = message;
  const announcement = workPanel.querySelector('.work-announcement');
  const warning = failed ? failure : stale || (conflict ? 'Recovery copies are available.' : '');
  if (warning && announcement.textContent !== warning) announcement.textContent = warning;
  else if (!warning && announcement.textContent && announcement.textContent !== 'Learner work saved.' && !work.saving) announcement.textContent = 'Learner work saved.';
  control('work-actions').hidden = !failed && !conflict && !stale;
  control('retry-save').hidden = !failed;
  control('work-copies').hidden = !conflict;
  if (workPanel.contains(focused) && focused.closest('[hidden]')) control('work-status').focus({preventScroll:true});
  workPanel.classList.toggle('needs-attention',failed || conflict || Boolean(stale));
  if (versions.dataset.ids !== work.copies.map(c=>c.id).join()) {
    const selected = versions.value;
    versions.replaceChildren(...work.copies.map(c=>new Option(versionLabel(c),c.id)));
    if (work.copies.some(c=>c.id===selected)) versions.value = selected;
    versions.dataset.ids = work.copies.map(c=>c.id).join();
    displayCopy();
  }
  const completion = document.getElementById('completion-note');
  if (completion) {
    document.getElementById('complete').checked = Boolean(state.completed[activePage]);
    if (work.isPending(['completed', activePage])) {
      completion.textContent = failed ? 'Save unavailable. Keep this tab open and retry or export learner work.' : 'Saving progress…';
    } else {
      completion.textContent = Object.hasOwn(work.confirmed.completed, activePage) ? 'Progress saved in this browser.' : '';
    }
  }
  if (work.dirty) addEventListener('beforeunload',warnUnload);
  else removeEventListener('beforeunload',warnUnload);
}
versions.addEventListener('change',displayCopy);
control('retry-save').onclick = () => work.flush();
control('export-work').onclick = () => {
  const backup = work.backup();
  if (lessonView) {
    const {slug, index, program, answer} = lessonView.snapshot();
    backup.openLesson = {slug, caseIndex:index, program, prediction:answer};
  }
  download('cuda-python-learner-work.json',JSON.stringify(backup,null,2),'application/json');
};
control('remove-copy').onclick = () => {
  if (confirm('Remove the selected recovery copy from this browser? Export learner work first to keep a file.')) work.removeCopy(versions.value);
};
await work.load();
work.migrate(legacyReadingWork(), clearLegacyReadingWork);

const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const number = (slug) => String(order.indexOf(slug) + 1).padStart(2, "0");
const lessonURL = (slug) => `#lesson/${slug}`;
const lessonLink = (slug) => `<a data-progress-lesson="${slug}" href="${lessonURL(slug)}">${escape(lessons[slug].title)}<span class="lesson-done" role="img" aria-label="Complete" ${state.completed[slug]?'':'hidden'}>${materialSymbol('check')}</span></a>`;
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
document.querySelector("#course-nav > summary").insertAdjacentHTML("beforeend",materialSymbol("expand_more","course-chevron"));
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

const sectionID=module=>"section-"+modules.indexOf(module);
function updateNav(page) {
  const module = modules.find((part) => part.lessons.includes(page));
  const current = lessons[page]?.title ?? { course: "Course outline", gpu: "Appendix A", compiler: "Compiler lab" }[page];
  document.querySelector("#course-location").innerHTML = `<ol>
    ${module ? `<li><span aria-hidden="true">/</span><a href="#course/${sectionID(module)}">${escape(module.title)}</a></li>` : ""}
    <li><span aria-hidden="true">/</span><span aria-current="page">${escape(current)}</span></li>
  </ol>`;
  const completed = order.filter((slug) => state.completed[slug]).length;
  document.querySelector("#progress").max = order.length;
  document.querySelector("#progress").value = completed;
  document.querySelector("#course-progress").textContent = `${completed} / ${order.length} complete`;
  document.querySelectorAll("[data-page]").forEach((link) => {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const focusedHref=document.activeElement?.closest("#lesson-nav a")?.getAttribute("href");
  document.querySelector("#lesson-nav").innerHTML = modules.map((module) => `
    <section class="nav-group">
      <h2>${escape(module.title)}</h2>
      <ul>${module.lessons.map((slug) => `
        <li><a class="lesson-link" href="${lessonURL(slug)}" ${page === slug ? 'aria-current="page"' : ""}>
          <span class="lesson-index">${number(slug)}</span>
          <span>${escape(lessons[slug].title)}</span>
          ${state.completed[slug] ? '<span class="lesson-done" role="img" aria-label="Complete">'+materialSymbol('check')+'</span>' : ""}
        </a></li>`).join("")}
      </ul>
    </section>`).join("");
  if(focusedHref)document.querySelector('#lesson-nav a[href="'+focusedHref+'"]')?.focus({preventScroll:true});
  for(const link of main.querySelectorAll('[data-progress-lesson]'))link.querySelector('.lesson-done').hidden=!state.completed[link.dataset.progressLesson];
}

function showCourse() {
  main.innerHTML = `<div class="resource-page">
    <div class="course-home-opening"><div class="course-home-copy">
    <h1>CUDA Python Lab</h1>
    <p class="lead">Learn GPU programming with CUDA Python. Edit complete programs and run them with GPGPU-Sim in the browser or in a notebook on an NVIDIA GPU.</p>
    <section class="reading course-start">
      <h2>Before you start</h2>
      <p>You’ll need to know how to read Python functions, loops, and array indices. The browser simulator needs no GPU or installation. For optional hardware experiments, use an NVIDIA GPU with Jupyter or a hosted GPU runtime such as Google Colab. Diagrams and recordings show how CUDA maps your code to hardware.</p>
      <p>Start with twelve core labs, then continue with five follow-up labs on memory access, precision, synchronization, and tuning.</p>
      <p><a href="#gpu">Appendix A</a> covers notebook setup, debugging, and profiling.</p>
      <a class="button primary" href="${lessonURL(order[0])}">Start the first lab</a>
    </section></div>${homeArchitecture('python')}</div>
    <div class="course-modules">
      ${modules.map((module) => `<section class="course-module" id="${sectionID(module)}">
        <h2>${escape(module.title)}</h2>
        <p>${escape(module.description)}</p>
        <ol start="${Number(number(module.lessons[0]))}">
          ${module.lessons.map((slug) => `<li>${lessonLink(slug)}<p>${escape(lessons[slug].summary)}</p></li>`).join("")}
        </ol>
      </section>`).join("")}
    </div>
    <p class="credit"><a href="#compiler">Optional GPU lab · What happens at the first launch?</a></p>
    <p class="credit">Inspired by the predict, run, and explain activities in <a href="https://snowch.github.io/cuda-cpp-lab/v2/">CUDA C++ Lab</a>.</p>
  </div>`;
}

function showGpu() {
  main.innerHTML = `<div class="resource-page">
    <h1 class="appendix-title">Appendix A. Run on an NVIDIA GPU</h1>
    <p class="lead">Use an NVIDIA GPU on your computer or through a hosted notebook service. Start with the lab notebook, then use the investigations to measure and debug GPU work.</p>
    <section class="reading">
      <h2>Run with GPGPU-Sim in the browser</h2>
      <p><strong>Run</strong> executes your full Python program in the browser. The browser’s compatibility compiler translates the kernel to GPU instructions (PTX), then GPGPU-Sim runs them. The downloaded notebook uses Numba-CUDA-MLIR on an NVIDIA GPU. Use <strong>Inspect compiled PTX</strong> to see the instructions.</p>
      <p>Use <code>print()</code> in <code>main()</code> to show values in the Console. Use the GPU notebook for print calls inside kernels and for hardware timing.</p>
      <p><a href="${new URL("./runtime/gpgpu-sim-LICENSE.txt",import.meta.url).href}">GPGPU-Sim and LLVM licences</a> · <a href="${new URL("./runtime/pyodide-LICENSE.txt",import.meta.url).href}">Pyodide licence</a></p>
    </section>
    <section class="reading">
      <h2>Open and run a lab notebook</h2>
      <p>The notebooks use Numba-CUDA-MLIR, NVIDIA’s successor to Numba-CUDA. This course teaches its CUDA API; you do not need a separate Numba course. <a href="#compiler">Explore first-launch compilation in an optional GPU lab.</a></p>
      <ol>
        <li>In a lesson, choose <strong>Download notebook</strong>. It contains the complete program in your editor and the expected result for the selected starter case.</li>
        <li>Open the file in Jupyter on a machine with an NVIDIA GPU, or upload it to <a href="https://colab.research.google.com/">Google Colab</a>. In Colab, choose <strong>Runtime → Change runtime type</strong>, select a GPU, and save.</li>
        <li>Run the cells from top to bottom. The first cell installs the Python dependencies. If the notebook asks for a Python restart, restart the session, then continue with the cell after the installation command.</li>
        <li>Read the output under <strong>Run the program</strong>. <strong>Check the output</strong> compares the returned array with the selected starter case. Make the next edit in the program cell and rerun it.</li>
      </ol>
    </section>
    <section class="reading">
      <h2>Set up Python locally</h2>
      <p>Use Python 3.12, an NVIDIA GPU with compute capability 7.0 or later, and a driver compatible with CUDA 12. Download <a href="${new URL("./gpu/requirements.txt",import.meta.url).href}" download>requirements.txt</a>, open a terminal in its directory, and run these commands on a Linux machine with an NVIDIA GPU. Select the environment in Jupyter, or use it to run the scripts below.</p>
      <pre><code>python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt</code></pre>
      <p><a href="https://nvidia.github.io/numba-cuda-mlir/">Numba-CUDA-MLIR documentation</a></p>
    </section>
    <section class="reading">
      <h2>Profile larger workloads on hardware</h2>
      <p><a href="${new URL("./gpu/cuda-python-investigations.zip",import.meta.url).href}" download>Download the native investigations</a>, extract the archive, and open a terminal in the extracted directory. The included INVESTIGATIONS.md explains what to compare for each workload. For the softmax investigation, install a CUDA-enabled build of PyTorch for your GPU.</p>
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

function formatLessonIntro(intro, program) {
  return intro.map((part, index) => {
    if (typeof part === "string") return `<p>${escape(part)}</p>`;
    const caption = `excerpt-caption-${index}`;
    return `<figure class="lesson-excerpt">
      <figcaption id="${caption}">${escape(part.label)}</figcaption>
      <pre tabindex="0" aria-labelledby="${caption}"><code>${escape(programExcerpt(program, part))}</code></pre>
    </figure>`;
  }).join("");
}

function showLesson(slug) {
  const lesson = lessons[slug];
  const index = order.indexOf(slug);
  const walkthrough = walkthroughs[slug];
  const defaultProgram = standaloneProgram(starters[slug], lesson.cases[0]);
  main.innerHTML = `<article>
    <header class="lesson-heading">
      <h1>${escape(lesson.title)}</h1>
      <p class="lead">${escape(lesson.summary)}</p>
      <div class="reading lesson-context">
        ${formatLessonIntro(lesson.intro, defaultProgram)}
      </div>
    </header>

    <section class="prediction">
      <label for="prediction">Predict before you run</label>
      <p id="prediction-prompt">${escape(lesson.predict)}</p>
      <textarea id="prediction" rows="1" aria-describedby="prediction-prompt"></textarea>
    </section>

    <section class="reading experiment">
      <h2>Run the experiment</h2>
      <p>${lesson.cases.length > 1 ? "Select a case in the editor." : "Use the program in the editor."} Choose <strong>Run</strong> for GPGPU-Sim or <strong>Download notebook</strong> to use an NVIDIA GPU in Colab or Jupyter. <a href="#gpu">GPU setup instructions</a></p>
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
              <button class="button" id="update-imports" type="button" hidden>Update CUDA imports</button>
              <button class="button" id="download-source" type="button">Export .py</button>
            </div>
            <p class="editor-note" id="target-note" role="status" hidden></p>
          </details>
        </div>
        <div id="source" class="codebox"></div>
        <button type="button" class="button" id="editor-review" hidden>Review saved program</button>
        <p class="editor-shortcuts" id="editor-shortcuts">Ctrl/⌘ + Enter to run · Esc then Tab to leave the editor</p>
        <div class="workbench-controls">
          <label class="case-control" for="case" ${lesson.cases.length === 1 ? "hidden" : ""}>Case
            <select id="case" ${lesson.cases.length > 1 ? 'aria-describedby="case-note"' : ""}>${lesson.cases.map(({ label }, i) => `<option value="${i}">${escape(label)}</option>`).join("")}</select>
          </label>
          <div class="actions">
            <button class="button primary" id="run" type="button">Run</button>
            <button class="button" id="stop" type="button" hidden>Stop</button>
            <button class="button" id="download-notebook" type="button">Download notebook</button>
          </div>
        </div>
        ${lesson.cases.length > 1 ? '<p class="editor-note" id="case-note">Kernel edits carry across cases. The host code has a draft for each case.</p>' : ""}
        <p class="editor-note" id="draft-note" role="status" hidden></p>
      </div>
      <section class="workbench-card run-console" aria-labelledby="console-title">
        <h2 id="console-title">Console <span>GPGPU-Sim</span></h2>
        <p class="editor-note" id="run-status" role="status"></p>
        <p class="editor-note" id="runtime-previous-note" hidden>Previous program output is shown. The current program has not run.</p>
        <pre id="run-output" tabindex="0" aria-label="Program output" hidden></pre>
        <div id="runtime-recovery" hidden><p class="editor-note" id="runtime-recovery-note">Choose Reload lesson while online to load the current runner files. The page saves your code and prediction first. After the lesson reloads, click Run.</p><button class="button primary" id="reload-runner-files" type="button">Reload lesson</button><details id="runtime-error-details"><summary>File download details</summary><pre id="runtime-error"></pre></details></div>
        <details id="ptx-panel" hidden><summary>Inspect compiled PTX</summary><pre id="ptx-output" tabindex="0"></pre></details>
      </section>
    </section>

    <section class="reading lesson-explanation">
      <h2>Explain the result</h2>
      <p>${escape(lesson.explain)}</p>
      ${diagrams[slug] ?? ""}
      ${hardwareLocation(slug)}
    </section>
    <section class="lesson-resources" aria-label="Optional lesson resources">
      ${walkthrough ? `<details id="walkthrough" class="walkthrough resource-details resource-row">
        ${resourceSummary("smart_display",walkthrough.title,`${durationLabel(mediaDurations[slug])} · Video, captions and transcript`)}<div class="resource-body">
        <video data-walkthrough="${slug}" controls playsinline preload="none" width="960" height="540" aria-label="${escape(walkthrough.title)}" poster="${new URL(`./media/${slug}/poster.webp`,import.meta.url).href}">
          <source src="${new URL(`./media/${slug}/walkthrough.mp4`,import.meta.url).href}" type="video/mp4">
          <track src="${new URL(`./media/${slug}/captions.vtt`,import.meta.url).href}" kind="captions" srclang="en" label="English" default>
        </video>
        <details id="walkthrough-transcript" class="walkthrough-transcript"><summary>Read the transcript</summary>
          ${walkthrough.stages.map(({ title, narration }) => `<h3>${escape(title)}</h3><p>${escape(narration)}</p>`).join("")}
        </details></div>
      </details>` : ""}
      ${lessonReferences(slug)}

    <details id="native-investigation" class="native-card resource-row">
      ${resourceSummary("science","Further GPU investigation","Run or measure this example on an NVIDIA GPU")}<div class="resource-body">
      <p>${escape(lesson.native)}</p>
      <p><a href="#gpu">Appendix A · GPU setup and tools</a></p>
    </div></details>
    </section>
    <section class="lesson-completion" aria-label="Lesson completion"><label class="completion-label"><input type="checkbox" id="complete" ${state.completed[slug]?"checked":""}> Mark lesson complete</label><p id="completion-note"></p></section>
    <nav class="lesson-footer" aria-label="Lesson sequence">
      <a class="lesson-card" href="${index>0?lessonURL(order[index-1]):'#course'}"><span class="lesson-direction">${index>0?'← Previous lesson':'Course overview'}</span><strong>${index>0?escape(lessons[order[index-1]].title):'Choose a lesson'}</strong></a>
      <a class="lesson-card lesson-next" href="${index<order.length-1?lessonURL(order[index+1]):'#course'}"><span class="lesson-direction">${index<order.length-1?'Next lesson →':'Course overview'}</span><strong>${index<order.length-1?escape(lessons[order[index+1]].title):'Choose a lesson'}</strong></a>
    </nav>
  </article>`;
  const find = (id) => main.querySelector(`#${id}`);
  find("walkthrough")?.addEventListener("toggle", ({ currentTarget }) => {
    if (!currentTarget.open) currentTarget.querySelector("video").pause();
  });
  const input = find("case");
  const draftNote = find("draft-note");
  const targetNote = find("target-note");

  const readingCase = savedReadingState()?.controls.find(([id]) => id === 'case')?.[1];
  const selectedCase = readingCase ?? state.cases[slug];
  input.value = lesson.cases[selectedCase] ? selectedCase : 0;
  let caseIndex = Number(input.value);
  let fixture = lesson.cases[caseIndex];
  let starter = standaloneProgram(starters[slug], fixture);

  function caseSource(record = state) {
    const kernel = record.drafts[slug] ?? starters[slug];
    const previous = record.programs[slug]?.[caseIndex];
    if (previous === undefined) return standaloneProgram(kernel, fixture);
    if (record.drafts[slug] === undefined) return previous;
    const parts = splitProgram(previous);
    return parts && parts.kernel.trimEnd() !== kernel.trimEnd() ? joinProgram(kernel, parts.host) : previous;
  }

  function restoredSource() {
    const legacyKernel = state.restoredDrafts[slug];
    return state.restoredPrograms[slug]?.[caseIndex] ?? (legacyKernel === undefined ? undefined : standaloneProgram(legacyKernel, fixture));
  }

  function updateRestore(message = "") {
    const isStarter = editor.source === starter;
    const legacy=migrateCudaImports(editor.source)!==editor.source;
    find('update-imports').hidden=!legacy;
    if(legacy)message='This saved program uses an older CUDA import. In Editor tools, choose Update CUDA imports to adapt it. Your other edits are kept.';
    find("restore").disabled = isStarter;
    find("undo-restore").hidden = !isStarter || restoredSource() === undefined;
    draftNote.textContent = message;
    draftNote.hidden = !message;
    targetNote.hidden = true;
  }

  let shownSource = caseSource();
  function saveEditor(message) {
    const source = editor.source;
    const parts = splitProgram(source);
    const before = splitProgram(shownSource);
    if (parts && parts.kernel !== before?.kernel) work.change(['drafts',slug],parts.kernel);
    work.change(['programs',slug,String(caseIndex)],source,{displayed:shownSource,hostChanged:!parts || parts.host !== before?.host});
    shownSource = source;
    updateRestore(message);
    runner.reset();
  }

  const editor = mountProgramEditor(find("source"), caseSource(), () => saveEditor(), () => runner.start());
  const runner = attachRunner(main, {
    getSource: () => editor.source,
    filename: `${slug}.py`,
    getResult: () => state.results[slug]?.[caseIndex],
    saveResult: result => work.change(["results",slug,String(caseIndex)],result),
  });
  activeRunner = runner;
  activeEditor = editor;
  updateRestore(editor.source === starter ? "" : "A saved edit is open.");

  find("prediction").value = state.predictions[slug] ?? "";
  find("prediction").addEventListener("input", (event) => {
    work.change(["predictions",slug],event.target.value);
  });

  const prediction = find("prediction");
  lessonView = {
    editorNotice: find("editor-review"),
    snapshot: () => ({
      slug, index: caseIndex, context: lesson.title + ' · ' + fixture.label,
      program: editor.source, savedProgram: caseSource(work.confirmed),
      answer: prediction.value, savedAnswer: work.confirmed.predictions[slug] ?? '',
    }),
    apply(version) {
      work.refresh(['drafts','programs','predictions','restoredDrafts','restoredPrograms','results']);
      if (work.dirty || work.saving || work.error) return;
      if (version.answer !== version.savedAnswer) prediction.value = version.savedAnswer;
      if (version.program !== version.savedProgram) {
        shownSource = version.savedProgram;
        editor.reset(shownSource);
        updateRestore('The reviewed program is open.');
        runner.reset();
      } else prediction.focus();
      latestReview.reset();
      updateSaveStatus();
    },
  };
  lessonView.editorNotice.onclick = latestReview.open;

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
  find('update-imports').addEventListener('click',()=>{
    editor.replace(migrateCudaImports(editor.source));find('editor-tools').open=false;
    updateRestore('CUDA imports updated. Your other edits are kept. Ctrl/⌘ + Z restores the previous code.');
  });
  find("restore").addEventListener("click", () => {
    work.change(['restoredPrograms',slug,String(caseIndex)],editor.source);
    find("editor-tools").open = false;
    editor.reset(starter);
    saveEditor("The starter is open. Use Undo restore in Editor tools to recover your edit.");
  });
  find("undo-restore").addEventListener("click", () => {
    const source = restoredSource();
    if (Object.hasOwn(state.restoredPrograms[slug] ?? {}, caseIndex)) work.change(['restoredPrograms',slug,String(caseIndex)],undefined);
    else work.change(['restoredDrafts',slug],undefined);
    find("editor-tools").open = false;
    editor.reset(source);
    saveEditor("Your previous edit is open.");
  });

  input.addEventListener("change", () => {
    latestReview.reset();
    caseIndex = Number(input.value);
    work.refresh(['drafts','programs','restoredDrafts','restoredPrograms','results']);
    fixture = lesson.cases[caseIndex];
    starter = standaloneProgram(starters[slug], fixture);
    work.change(['cases',slug],caseIndex);
    shownSource = caseSource();
    editor.reset(shownSource, { focus: false });
    updateSaveStatus();
    updateRestore(editor.source === starter ? "" : "A saved edit is open.");
    runner.reset();
  });

  find("download-notebook").addEventListener("click", () => {
    const source = editor.source;
    const notebook = makeNotebook(lesson, source, fixture);
    download(`${slug}.ipynb`, JSON.stringify(notebook, null, 2), "application/json");
  });
  find("download-source").addEventListener("click", () => {
    download(`${slug}.py`, migrateCudaImports(editor.source), "text/x-python");
  });
  find("complete").addEventListener("change", () => {
    work.change(['completed',slug],find("complete").checked);
    updateNav(slug);
  });
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = url;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Let the browser claim the blob even when compilation or storage work is busy.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function route(moveFocus = false) {
  if (location.hash === "#main") return;
  const requested = location.hash.slice(1);
  const slug = requested.startsWith("lesson/") ? requested.slice(7) : requested;
  const section = requested.startsWith("course/") ? requested.slice(7) : null;
  const page = section!==null || requested==='' ? "course" : slug === "course" || slug === "gpu" || slug === "compiler" || order.includes(slug) ? slug : order[0];
  for (const video of main.querySelectorAll("video")) video.pause();
  dispatchEvent(new Event("cuda-python-lab:lesson-changed"));
  latestReview.reset();
  lessonView = undefined;
  activeEditor?.destroy();
  activeEditor = null;
  activeRunner?.dispose();
  activeRunner = null;
  work.refresh();
  activePage=page;
  updateNav(page);
  if (page === "course") showCourse();
  else if (page === "gpu") showGpu();
  else if (page === "compiler") {
    main.innerHTML=compilerLabHTML();
    document.querySelector("#download-compiler-notebook").addEventListener("click",()=>download("first-launch-mlir.ipynb",JSON.stringify(compilerNotebook(),null,2),"application/json"));
  }
  else showLesson(page);
  (main.querySelector('.prediction') ?? main).append(workPanel);
  updateSaveStatus();
  document.title = page === "course" ? "CUDA Python Lab" : `${lessons[page]?.title ?? (page === "compiler" ? "First-launch compiler lab" : "Appendix A")} · CUDA Python Lab`;
  if (moveFocus) {
    courseNav.open = false;
    syncCourseNav();
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
  if(section)requestAnimationFrame(()=>document.getElementById(section)?.scrollIntoView({block:"start"}));
}

document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  main.focus();
});

try {
  const response = await fetch(new URL("./starters.json",import.meta.url));
  if (!response.ok) throw new Error("Could not load the starter kernels.");
  starters = await response.json();
  route();
  registerReadingState({flush:async () => {
    do { await work.flush(); } while (work.saving && !work.error);
    if (work.error || work.dirty) throw Error('Learner work could not be saved. Export it or retry.');
  }});
  restoreReadingState();
  window.addEventListener("hashchange", () => route(true));
} catch (error) {
  main.textContent = error.message;
}

addEventListener('storage',async event=>{
  if (event.key !== workKey && event.key !== null) return;
  await work.observe();
  if (activePage) updateNav(activePage);
});
const header=document.querySelector('.site-header');
new ResizeObserver(()=>document.documentElement.style.setProperty('--course-header-height',header.getBoundingClientRect().height+'px')).observe(header);
