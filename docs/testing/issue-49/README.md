# Issue 49 · Task-centred workbench and first host/device experiment

The first lesson asks learners to predict which of three arrays changes, select a buffer at the store, follow its line into editable Python, and test their explanation in GPGPU-Sim. Across all 17 lessons the full current edit, evidence cue and saved prediction are available between Run and Console. The first recording remains available with captions and a transcript. [Implementation issue and scope clarification](https://github.com/snowch/cuda-python-lab/issues/49) · [Owner's curriculum direction](https://github.com/snowch/cuda-python-lab/issues/43#issuecomment-7239965434) · [PR #50](https://github.com/snowch/cuda-python-lab/pull/50)

**Tested builds.** Baseline main was `25eca9769098e0f71ae78553307881668ef06c16`, which includes PR #48. The implementation was built and tested at `e8522c5f73d0b20369f6c578010ecc0f1894c71b`. Subsequent commits contain only review evidence and its reproduction scripts. The release inventory includes the complete offline manifest identities. [Source CI](https://github.com/snowch/cuda-python-lab/actions/runs/46151389023) · [PR-head checks](https://github.com/snowch/cuda-python-lab/pull/50/checks) · [Both releases and byte counts](logs/release-size.json)

## Acceptance matrix

| Gate | What was verified | Evidence |
| --- | --- | --- |
| A05 and responsive workbench | Captured the course, 17 lessons and two appendices at 320, 390, 820 and 1440 CSS px in both themes before and after. Prototyped first-value and softmax against the built parent at all eight combinations. On a 390 × 850 viewport the keyboard user could read the entire selected edit from the observed output with zero Page Ups. The baseline required two and moved 1,138 px. | [Baseline captures, 160](captures/baseline-routes.zip) · [Prototype, 16](captures/responsive-prototype.zip) · [Release captures, 160](captures/release-routes.zip) · [Design and copy review](design.md) |
| Real executable first-value experiment | Verified exact exported Python and fixture `one`. Executed all eight supported programs, including each host/store pair with and without the original-host print. Matched the actual stdout, source identity and compiled PTX. Each of the eight steps has visible buffer text, a source line and a selectable description. | [Run ledger](logs/first-value-runs.json) · [Exported programs](programs/) · [Step text and descriptions](logs/text-equivalents.json) · [Regression tests](../../../tests/workbench.test.mjs) |
| Source changes, learner work and failures | Applied a proposed edit explicitly, prepared the prior task prerequisite and used Undo to recover the entire previous Python export. Ran custom code storing 91 in GPGPU-Sim and verified the model withdrew. Checked a real syntax error, stale output after editing, reload, case and task navigation, storage failure, JSON export and retry. The existing suite also exercised concurrent tabs, stale review, archived kernels, legacy records, interrupted writes, reversible completion and offline updates. | [Exercise and assertions](experiments.mjs) · [Diagnostic and offline observations](logs/interaction.json) · [Regression output](logs/npm-test.log) · [48 interaction captures](captures/interaction-states.zip) |
| Course regression and execution | 51 JavaScript/browser tests passed, including two new workbench tests. The dedicated GPGPU-Sim suite passed. All 38 pristine cases and 51 learner instructions were replayed, covering 58 phases, 56 guided simulator runs and 12 source-reasoning phases. The new 96-record ledger is byte-identical to the previous reviewed replay. All eight CPU notebook tests passed. CPU-only PTX generation covered 17 lesson kernels and the native examples. Existing test assertions were preserved. | [Browser suite](logs/npm-test.log) · [Runner](logs/npm-runner.log) · [Replay log](logs/guided.log) · [Replay ledger](logs/guided-runs.jsonl) · [CPU notebooks](logs/cpu-checks.log) · [PTX](logs/ptx.log) |
| A07 and operability | At 390 px, axe found 78 affected nodes on baseline and zero on the release across 40 route/theme scans. Expanded controls on four routes also had zero reported violations at 320 px in both themes. Measured zero page-wide overflow across all 160 release views. Verified the editing escape sequence, Run → Stop → Run focus, keyboard navigation to Console, undo and recovery, a pressed buffer's accessible name, keyboard scrolling in command regions, reduced motion and emulated touch. | [Baseline scan](logs/baseline-routes.json) · [Release scan](logs/release-routes.json) · [Expanded scan](logs/expanded-axe.json) · [Keyboard before](logs/keyboard-baseline.json) · [Keyboard after](logs/keyboard.json) · [Accessible tree](logs/trace-accessible-tree.txt) |
| 200% zoom and offline use | Changed Chromium's native zoom from 1× to 2× at a fixed window size. The viewport measured 1280 then 640 CSS px, with no horizontal page overflow on first-value, softmax and the GPU appendix. Downloaded the offline release, disabled networking, reloaded, changed the Python source and ran it through GPGPU-Sim. Played the optional recording offline and sought to the store while displaying its active caption. The measured offline payload grew by 19,567 bytes, from 63,275,671 to 63,295,238. | [Zoom measurements](logs/zoom.json) · [200% actual capture](screenshots/zoom-200-first-value.jpg) · [Offline execution](logs/first-value-runs.json) · [File sizes](logs/release-size.json) |
| Recording parity and change boundary | Mapped all seven narrated learning points to eight learner-controlled steps. Checked source, captions, examples and decoded recording. Retained the video, caption file and poster. The design note describes the reusable step controls and the model that belongs to this one fixture. | [Parity matrix](video-parity.md) · [Controller contract](design.md#reuse-boundary) · [Mobile store](screenshots/trace-390-light.jpg) · [Desktop store](screenshots/trace-1440-dark.jpg) |

## What the measurements mean

Positions below are measured in CSS pixels from the document top to the top of each control. “Old gap” is the distance from the full selected instruction to Run on main. “New gap” is the distance from Run to the **Current task** disclosure, which opens with the full instruction, evidence and any typed prediction. The raw coordinates include the editor and Console. The keyboard test separately measures how much scrolling was actually necessary to re-read the whole instruction. [Baseline geometry](logs/baseline-routes.json) · [Prototype geometry](logs/responsive-prototype.json) · [Release geometry](logs/release-routes.json)

| Width | First-value old gap | First-value new gap | Softmax old gap | Softmax new gap |
| ---: | ---: | ---: | ---: | ---: |
| 320 | 1,106 | 89 | 1,097 | 90 |
| 390 | 1,050 | 89 | 1,069 | 90 |
| 820 | 923 | 54 | 914 | 54 |
| 1440 | 923 | 54 | 885 | 54 |

On baseline, axe reported 40 visible-name mismatches on the course brand and 38 scroll-region findings, including 34 lesson editor nodes. The release uses the visible brand text, a single keyboard entry into CodeMirror, and named keyboard-scrollable command regions. The recorded keyboard sequence selects and prepares the original-host task, enters a prediction, inserts the host print at the revealed line, runs, inspects output and returns to the plan. During the separate stopped run, focus now follows the available control in both directions. Announcements use a polite step narrative, existing run/save status regions, and plain text for output and selection. The browser accessibility tree exposes the device name, value, operation and pressed state. [Keyboard focus screenshot](screenshots/keyboard-run-focus.png) · [Error](screenshots/execution-error-320-dark.jpg) · [Save recovery](screenshots/save-recovery-390-dark.jpg) · [Undo scope](screenshots/prepare-undo-390-light.jpg)

## Measured output and model boundary

Each row uses one block, one thread, and one float32 element. These are the two lines actually printed when the learner selects **Result and original**. Without the added host print, stdout contains only the first line. The device value displayed at the store is derived from the supported source. The experiment supplies no per-instruction memory trace.

| Original host | Kernel store | Copied result in stdout | Original in stdout |
| ---: | ---: | --- | --- |
| 0 | 42 | `out = [42.0]` | `[0.0]` |
| 0 | 73 | `out = [73.0]` | `[0.0]` |
| 5 | 42 | `out = [42.0]` | `[5.0]` |
| 5 | 73 | `out = [73.0]` | `[5.0]` |

The starter's complete Python SHA-256 is `3e323f4c00e00ebc22fe8089b3602865416a4e0f9b55744ba1644d89f3b775ec`. The harness constructs each reference independently of the visualisation, checks the downloaded source byte for byte, and checks the source and case attached to the saved result. PTX hashes identify individual compilations and can vary between launches. [Exact observed runs](logs/first-value-runs.json) · [Result on a 320 px screen](screenshots/result-320-light.jpg)

## Reproduce

Use the repository's Node and Python setup. The original run used Debian 13 x86-64, Chromium 156.0.8078.79, Playwright Core 1.65.1, Node 24.22.3, npm 11.19.1, Python 3.12.14, NumPy 2.4.6, numba-cuda-mlir 0.6.0, nbformat 5.11.1 and axe-core 4.14.1. Install axe outside the app for the evidence scripts. The screenshot archives preserve the original screenshot bytes at viewport resolution.

```sh
npm ci
npx playwright-core install chromium --no-shell
npm test
npm run test:runner
python tests/test_notebooks.py
python scripts/check_native.py --ptx --cpu-only
npm run build
GUIDE_EVIDENCE=file:///tmp/issue49-guided/ node docs/testing/issue-45/run-guides.mjs
npm install --prefix /tmp/issue49-tools axe-core@4.14.1
export AXE_PATH=/tmp/issue49-tools/node_modules/axe-core/axe.min.js
# If using a system Chromium, set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to its executable.
node docs/testing/issue-49/layout.mjs dist /tmp/issue49-routes scan
node docs/testing/issue-49/keyboard.mjs dist /tmp/issue49-keys after
node docs/testing/issue-49/access.mjs dist /tmp/issue49-access
node docs/testing/issue-49/experiments.mjs dist /tmp/issue49-experiments
node docs/testing/issue-49/zoom.mjs dist /tmp/issue49-zoom
```

For the baseline and prototype, build the baseline commit in a second worktree. Pass that dist directory to this branch's `layout.mjs` with `scan` and then `prototype`, and to `keyboard.mjs` with `before`. Screenshots and harnesses under this directory are development evidence and are excluded from the shipped offline assets.

## Verification limits

Chromium supplied real DOM, keyboard, native zoom, service worker, bundled compiler and GPGPU-Sim execution. Touch was emulated. Quota exhaustion was injected at the storage boundary to exercise actual export and retry. Physical phone/tablet interaction, screen reader speech, voice control, other browser engines, uncoached learner comprehension and physical GPU execution were outside this verification. Scanner counts and accessibility trees cannot establish how a particular assistive technology speaks a control. Instructional parity with the recording awaits independent review. The requested model was GPT-6.2 Astra with High reasoning. This session exposed no independent runtime readout for that setting.
