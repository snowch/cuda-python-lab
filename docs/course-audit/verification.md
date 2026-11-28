# Verification record

## Environment and reproducibility

The checkout, baseline and deployment manifest identified cdfb58ee009ff221bde5062154a5b3ea4319f8a6. The audit was run on x86-64 Linux with Node 24.22.3, npm 11.19.1, Python 3.12.14 and installed Chromium 156.0.8078.79 through lockfile Playwright Core 1.65.1. The application build verified vendor checksums. The downloaded deployment manifest reports 63,202,260 bytes; this is the offline file total, not the payload transferred on every visit. No production files were edited. [Manifest](evidence/manifest.json) · [Published release](https://snowch.github.io/cuda-python-lab/release.json)

From the repository root, install and build with the checked-in lockfile. Set the browser executable to the locally installed Chromium. The audit used a copy of the built dist to isolate measurement from the test scripts, which rebuild dist.

```sh
npm ci
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
npm test
npm run test:runner
python -m http.server 8012 --bind 127.0.0.1 --directory dist
```

In another terminal in the checkout, run the following commands. The evidence writers replace their own output files. Use separate fresh contexts for the perfect starters and the authored sequence. A numeric action in the JSONL is a zero-based case selection, an array is a sequence of exact text replacements, and restore means the editor's Restore starter button. The harness reads the full current program through Export .py before applying edits via the editor. For softmax it removes the subtraction at both sites and leaves harmless whitespace before the closing parenthesis.

```sh
node docs/course-audit/execute.mjs cases
node docs/course-audit/execute.mjs steps
python docs/course-audit/check-cases.py
node docs/course-audit/extras.mjs
node docs/course-audit/exports.mjs
node docs/course-audit/errors.mjs
node docs/course-audit/recovery.mjs
node docs/course-audit/persistence.mjs
node docs/course-audit/usability.mjs
node docs/course-audit/views.mjs
node docs/course-audit/play.mjs
node docs/course-audit/media-layout.mjs
python docs/course-audit/media.py
node docs/course-audit/probe-models.mjs
```

The independent oracle script requires NumPy. Frame extraction uses FFmpeg and Pillow. For the automated accessibility probe, install axe-core 4.14.1 outside the repository and point AXE_PATH to its axe.min.js. For the optional speech screen, use faster-whisper 1.2.1, small.en snapshot d1d751a5f8271d482d14ca55d9e2deeebbae577f, CPU int8 and FFmpeg. The screen decoded every audio track. It was independent of the course's previous speech QA. [Accessibility probe](access.mjs) · [Audio screen](transcribe.py)

## What ran and what it establishes

| Check | Direct observation | Scope and evidence |
|---|---|---|
| Install/build | npm ci installed the lockfile dependencies. Both test commands completed their own build. | npm reported an esbuild install-script warning; the build and browser bundle worked. [Install](evidence/install.log) |
| Standard suite | 32 passed, 0 failed, 0 skipped. | Browser routes, media startup, notebook content, keyboard access, restore/undo, legacy state, completion concurrency, runner unit lifecycle, deployment and offline checks. Read individual test names to distinguish browser paths from unit tests. [Full log](evidence/test.log) |
| Dedicated runner suite | 1 integration test passed. | Iterates all 38 fixtures in Chromium and checks values. Also tests real edit, generated PTX, offline warm execution, unsupported call, cancellation/recovery and multi-kernel execution. [Full log](evidence/runner.log) |
| Independent execution | 38 fresh starter runs, 60 runs following the authored steps. All 38 independent CPU shape/value comparisons passed. | Rectangular NumPy transpose/matmul, stable high-precision softmax, convolution, integer counts/scan, explicit FP32 grouping, boundary/reference functions. The numerical tolerance was rtol 1e−5, atol 1e−6 for float outputs. Console serialization loses array dtype, so a numerical match cannot establish device dtype. [Oracle implementation](check-cases.py) · [Results](evidence/oracles.log) |
| Additional exercises | Ran the host initializer 5 edit (host 5, result 73), kept-item positions [0,1,2,3] and float64 host comparison 1.0 through the browser. Operated all three appendix worksheet settings in the prompt. | These optional calculations are executed browser evidence. They do not constitute running a native notebook. [Supplementary results](evidence/extras.log) |
| Export paths | Downloaded the .py and .ipynb for all 38 cases and compared the full selected program and label. Also downloaded the compiler notebook. | Verified bytes/structure, not native cell execution. Generated reference cell accepts equal values of wrong dtype in a direct CPU-only probe. [Downloads](evidence/exports.log) · [Reference probe](evidence/edited-checks.log) |
| Rendered UI | 20 routes × 4 viewport widths × 2 themes, 160 full-page captures, 0 measured page-wide overflow. Inspected route contact sheets, mobile/desktop workbench details and video frames. | Stable light/dark media state, 800 px viewport height. taskToRun in layout.json is the case selector's top relative to the viewport; the single-case selector is hidden. Desktop Chromium can defer CodeMirror offscreen gutter layout; use the focused viewport crop to evaluate line numbers. [Captures](evidence/views) · [Layout](evidence/layout.json) · [In-view editor](evidence/editor.png) |
| Media | All 17 MP4s reached ended at 1×, unmuted, with captions loaded, totaling 806.45 s and 202 VTT cues. One sampled frame per authored stage. Across all 63 stages the VTT narration matched the transcript. | Also captured 136 paused/captioned player views at 390 portrait, 844 landscape fullscreen, 820 tablet and 1440 desktop in both themes. Machine ASR transcripts include punctuation/name errors. Human pronunciation, listening comfort and device speaker playback remain open. [Playback](evidence/playback.jsonl) · [Media layouts](evidence/media-layout) · [Stage matrix](walkthroughs.md) |
| Keyboard/accessibility | Real editor escape via Esc then Tab reached Run. Standard browser tests exercise exports, keyboard-opened video and transcript, layout, nav and completion. Axe scanned 40 route/theme combinations at 390 px. | Two distinct rule IDs reported, including brand text and focusable scroll regions. This scan covered default visible states. Browser semantics and automated contrast checks cannot certify assistive technology usability or WCAG 2.2 AA conformance. [Scan](evidence/access.jsonl) · [Probes](evidence/usability.log) |
| Offline, errors, update and memory | At 120 ms latency and 3,000,000 downstream bytes/s an interrupted nvptx.wasm request raised recovery. Reload succeeded. Under those settings first successful run after recovery took 18,581 ms and warm run 2,390 ms. A fresh offline context failed to fetch its first page. The separate saved-course suite reopened a verified offline copy and updated two tabs. | Single observed elapsed samples with shared system load; no throughput benchmark. Tap-triggered run reported 92.3 MiB WASM; Free memory reported 0.0 MiB and retained [42]. These are allocations reported by the app, not total browser RSS. [Recovery](evidence/recovery.log) · [Memory and touch emulation](evidence/usability.log) · [Suite](evidence/test.log) |
| Errors and persistence | Syntax and invalid launch dimensions raised diagnostics. A one-past output store returned a zero with successful simulation status. A valid restored run returned 42. Quota injection and two-tab editing exposed missing saved work. | Quota failure was injected at the course storage key; the runner and compiler were real. An out-of-bounds result is not a portable prediction for native execution. [Error cases](evidence/errors.log) · [Storage](evidence/persistence.log) |
| Prototypes | Checked both themes at 320/390/820/1440, mapper reference launch sizes, selected index, one- vs three-warp issue, sector grouping, bank mapping and no horizontal overflow. Replayed stencil index 8 before and after restore. After independent review, selected index 15 by keyboard, switched from 16 to 13 values and back to 16, and verified one pressed button throughout. The selection moved to 12 and stayed there on return. [Rerun](evidence/usability-review.log) · [390 px capture](evidence/halo-case-switch.png) | Standalone, no external assets, no production imports. These are prototype smoke/reference checks. Further assistive-technology and learner tests are needed. [Model checks](evidence/models.log) · [Replay](evidence/usability.log) |

The first harness attempt tried to select the hidden singleton case and read long documents from the visible CodeMirror DOM. Its missing-anchor errors were harness failures. Reading the exported current program fixed them. A rapid sequence of paired downloads timed out once; the paced rerun completed all 38 pairs. An initial recovery click targeted the button behind the modal; the retest used the modal's Reload lesson. Chromium policy blocked file-URL navigation for a prototype test; the test loaded its exact local HTML bytes into Chromium. The first ASR decode via PyAV hit an incompatible metadata_errors argument; FFmpeg PCM decoding completed the screen. Use the final ledgers for conclusions. [Initial harness records](evidence/initial-attempts)

## Native hardware protocol and open checks

An isolated Python 3.12 environment installed the repository's native requirements, including numba-cuda-mlir 0.6.0 and NumPy 2.4.6. The CPU-only explicit SM 8.0 cross-compilation check completed for 17 kernels, the included tile/fusion/debug samples covered by the script, and the optional compiler lab. Running the same script in device-execution mode exited with “An NVIDIA GPU is required to execute notebooks”. No /dev/nvidia device or nvidia-smi executable was present. [Compiler and execution log](evidence/native.log)

On a physical NVIDIA GPU of supported capability (≥7.0, CUDA 12 compatible driver), start from the audited commit:

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r src/gpu/requirements.txt
nvidia-smi
python -m pip freeze
python scripts/check_native.py --ptx --cpu-only
python scripts/check_native.py
```

The last command executes both export forms, all cases, investigations covered by the script, and the compiler workload. Then use the appendix's downloaded archive and follow each numbered native instruction. Record stdout/stderr, expected shape/dtype, tool versions, device and driver. Save the first-launch notebook outputs for a fresh process, repeated call and same-type bias changes from 1 to 7 to 11. A clock delta across those runs includes launch and waiting. [Native checker](../../scripts/check_native.py) · [Native investigation commands, shapes and expected comparisons](../../src/gpu/INVESTIGATIONS.md)

| Native investigation | Evidence still needed |
|---|---|
| First value, vector-add, grid stride, reduction, scan, precision | Execute the notebook edits, capture original host and returned value, last-thread device prints for each launch, unordered thread visits, scratch[1]/scratch[5] at distance four, stable scatter positions and float64 comparison. |
| Transfers and streams | Run affine size sweep; change chunk divisor 4→8. Record CUDA events and round-trip time, pinned vs pageable scope, stream count, correctness and Nsight Systems timeline. |
| Direct/tiled transpose, divergence, gather, stencil, histogram | Compare same shapes and aligned permutations, reset counters, validate rectangular/edge outputs. Collect load/store sectors, shared-bank metrics and branch behavior on the actual target. Separate source counts, cache hits and DRAM bytes. |
| Matmul, softmax | Compare with a native library on identical shapes, stream, dtype and precision settings. Validate whole output and finite row sums with tolerances. Record event times and framework/driver versions. Test equal, one-column and extreme logits. |
| Bounds, shared handoff and sync | Retain both faulty and corrected Compute Sanitizer reports with exact checker, kernel, source line, launch and exit status. Racecheck concerns shared hazards; use memcheck for global out-of-bounds. |
| Fusion, occupancy and profiler | Run the same-stream two-launch baseline vs one fused kernel across all requested sizes/widths. Save correctness, warmup and median event times, launch timeline, register counts, eligible/issued warp and throughput counters. Interpret an occupancy difference alongside actual time. |

**Remaining limitations.** No physical GPU timing, native correctness, profiler counters, native fault behavior, Colab provisioning or inter-device comparison was verified. No physical iOS/Android, real soft keyboard, mobile memory-pressure test, Safari/Firefox, screen-reader/switch/voice user session or user study was available. Chromium desktop emulation supplied touch, media layout and fullscreen observations. A 1280×800 appendix check at 200% CSS zoom is a reflow probe; system browser zoom, operating-system text enlargement and all open overlay states need separate checks. Stylized hardware models and learners' responses to them remain hypotheses until tested. The linked Frontend Design and Instructional Design guides informed the final prototype critique: use actual index/sector data as the visual hierarchy, allow prediction before reveal, and assess a new case after the worked example.
