# Reusable browser code runner

CUDA Python Lab ports the CUDA C++ Lab runner contract to a hash-routed Python course. The header has Code runner, App status and a theme switch on every view. The course outline and GPU appendix remain in Course lessons.

## Ownership and lifecycle

The reading window owns one module worker. A lesson view attaches a client to that manager; leaving an idle lesson detaches the view without terminating the worker. Leaving a running lesson stops that job. Each run uses a fresh Python namespace and a fresh GPGPU-Sim device, while retaining Pyodide, NumPy, Numba, the NVPTX compiler and compiled simulator module. Program/device allocations are not reused as experiment state. Python program errors retain a usable toolchain; startup errors, worker crashes, cancellation and timeouts terminate it.

Header Start code runner sends only a prepare request. It never executes lesson code. Run during preparation queues one program behind that preparation; Stop cancels both. Late messages from terminated workers cannot complete another lesson's job. The run limit is 90 seconds, including startup. The default idle period is 30 minutes, counted from completion, with 5/15/30/60-minute choices stored separately from course work. Visibility/focus checks catch browser timer suspension. No idle timeout interrupts a busy run.

The first startup, whether requested from the header or an editor, immediately opens one native modal introduction with a dim backdrop. Loading and compilation continue behind it. Explicit dismissal or settings acknowledges the introduction in browser storage. Header Start → Ready → editor Run must not show the introduction a second time. Background clicks do not dismiss it, it has no expiry, and keyboard focus returns to the initiating control. Normal runner settings use a compact, dismissible nonmodal popover.

## Resource reporting

Report actual current WASM linear-memory allocations for Pyodide and the NVPTX backend, plus the active simulator device when sampled during execution. Inspect declared WASM memory imports/exports, never enumerate Emscripten proxy imports. Unavailable measurements say Unavailable. Free memory terminates the worker and reports zero for that worker. This excludes JavaScript objects, compiled modules, other tabs and browser overhead; it is not total device memory or a CPU percentage. Last compile and run is elapsed wall time, including queued startup, compilation and simulation. Preparation and failed programs do not become successful timings.

## Saved work and restart

Keep existing `cuda-python-lab-v1` drafts, per-case host programs, restore history, predictions, selections and completion. Add previous Console/PTX results with their source provenance; show a previous-run notice after editing. Freeing runtime memory must not clear results. Do not automatically rerun after restoring or updating. The worker is an optimization, never the owner of saved learner work.

The update transaction asks every open course tab to save a separate session snapshot, blocks while a runner or composition is active, and aborts if storage fails. Each tab restores its own hash route, work, open lesson sections and reading position after a successful restart.

## Verification

Runner unit tests cover ownership, reuse, queueing, idle settings, errors, cancellation, timeouts, stale replies and honest timings. Browser tests cover first-start acknowledgment, manual preparation, real compilation, cross-lesson reuse, retained work, memory release, keyboard dismissal, narrow/desktop layouts and light/dark themes. All lesson cases and an edited kernel are run with the actual browser compiler and GPGPU-Sim. These are functional checks, not evidence of learning effectiveness or physical Android/NVIDIA GPU performance.

Reference: [CUDA C++ Lab runner design](https://github.com/snowch/cuda-cpp-lab/blob/main/docs/code-runner-design.md).
