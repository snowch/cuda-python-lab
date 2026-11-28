# CUDA Python Lab

Learn GPU programming through seventeen hands-on labs for Python developers. Edit the complete CUDA Python program, including the kernel and the host `main()`, then run it with GPGPU-Sim in the browser or with a notebook on an NVIDIA GPU. The course follows the predict, run, and explain format of [CUDA C++ Lab](https://snowch.github.io/cuda-cpp-lab/v2/).

## Take the course

1. Pick a lesson and, where available, a case. The editor shows the complete prepared program. Enter an optional prediction.
2. Choose **Run** to execute it in the browser simulator. Inspect the named values in Console, make the suggested edit and run again. No GPU or installation is needed for this path.
3. For an optional NVIDIA GPU experiment, choose **Download notebook**. Open it in Jupyter or Google Colab. Run **Set up this notebook**, then choose your exported program or a numbered task. Every lesson case is in the file. Each program cell runs and checks its own source and input.


Choose **Export .py** in **Editor tools** to run the complete program directly with Python. Use Python 3.12, an NVIDIA GPU with compute capability 7.0 or later and a CUDA 12-compatible driver, and the dependencies in [requirements.txt](src/gpu/requirements.txt).

| Module | Labs |
| --- | --- |
| CUDA foundations | First kernel, bounds checks, grid-stride loops |
| Memory and execution | Host/device transfers, coalescing, warp divergence |
| Parallel patterns | Block reduction, atomic histogram, block scan |
| Reusing data and computing probabilities | Tiled transpose, tiled matrix multiplication, stable softmax |
| Design, debug, and tune kernels | Gather, shared-memory stencil, float32 rounding, synchronization debugging, fusion |

The first lesson has a self-paced host/device trace and text walkthrough. In vector addition, select a thread or element, edit the launch and use a sentinel to identify a missing write. Diagrams and the remaining captioned walkthroughs show how the programs use threads, blocks, warps, and GPU memory. Appendix A includes an occupancy worksheet and [GPU investigations](src/gpu/INVESTIGATIONS.md) with Compute Sanitizer, profiling, and a fusion capstone.

## Run in the browser

Open a lesson and choose **Run**. Python and NumPy execute the edited `main()`. The browser compatibility compiler uses a bundled Numba frontend to lower the CUDA kernel to LLVM IR, LLVM generates PTX, and GPGPU-Sim runs it. The entire run takes place in the browser. The Console shows what `main()` prints, and **Inspect compiled PTX** shows the generated instructions.

The first run loads the WebAssembly toolchain. The browser runner supports the kernels, numeric arrays, and small launches used in the course. Use the GPU notebook for kernel-side `print()`, hardware timing, and NVIDIA library functions. Browser softmax uses the GPU's approximate single-precision exponential.

The build pins Pyodide 0.27.7, Numba 0.68.1, llvmlite IR 0.50.0, and the [CUDA C++ Lab V2 LLVM backend and simulator](https://github.com/snowch/cuda-cpp-lab/tree/88237c7df5df7a71318f23f73f813c12435a837a/assets/cuda-workbench). See [browser toolchain sources and build instructions](vendor/README.md).

## Develop and verify

Use the [shared course design guide](docs/course-design-guide.md) for preferred
layout and interaction patterns across courses. It compares the CUDA C++ and
Python treatments and records remaining adoption work.

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open [localhost:8000](http://localhost:8000). Predictions, source drafts, case selections, and completion are stored in the current browser. Use `npm run build` to create the static site in `dist/`.

`src/course.mjs` defines the lessons and cases. `src/kernels/` contains the kernels, `src/host-program.mjs` generates the host code, and `src/notebook.mjs` builds the notebook exports.

```sh
# Install Chromium for Playwright if a system Chromium is unavailable.
npx playwright-core install chromium
npm test

# Run the end-to-end cases against a static site with Chromium.
npm run test:runner

# Cross-compile the migrated kernels with the actual MLIR compiler (no GPU execution).
python -m venv .venv
source .venv/bin/activate
python -m pip install -r src/gpu/requirements.txt
python scripts/check_native.py --ptx --cpu-only
# On an NVIDIA GPU, also execute the notebooks, guided variants and program exports.
python -m pip install ipython
python scripts/check_native.py
```

The browser checks cover the editor, saved drafts, exports, walkthroughs, and CUDA execution with a static server. Use the Playwright-pinned full Chromium build for media support; bulk export clicks are paced below Chrome’s download-rate limit while still checking every case. The native checks exercise the exported programs and compile their kernels with NVIDIA’s compiler. Hardware timing and behavior such as races require an NVIDIA GPU.

## Record walkthroughs

`src/walkthroughs.mjs` supplies the slides and transcript. The site build uses checked-in media. To rebuild it, install Chromium, FFmpeg, and uv, and clone [snowch/claude-skills](https://github.com/snowch/claude-skills) at `c9a7c521568632aa216932f4c965df386498602a`. Pass that checkout's `plugins/demo-video/skills/record-demo` directory and a work directory to the producer.

```sh
node scripts/build_walkthroughs.mjs /path/to/record-demo /path/to/work prepare
node scripts/build_walkthroughs.mjs /path/to/record-demo /path/to/work narrate
node scripts/build_walkthroughs.mjs /path/to/record-demo /path/to/work screen
node scripts/build_walkthroughs.mjs /path/to/record-demo /path/to/work export
```

Append lesson slugs such as `vector-add` to each command to rebuild just those walkthroughs. Review the speech output and slides before export. The work directory retains the WAVs, screening reports, silent masters, and shot lists. The export updates the browser MP4, WebVTT captions, and poster for each walkthrough. See [the contributor rules](AGENTS.md#record-walkthroughs).

## Browser code runner and offline access

The header offers **Code runner**, **App status**, and the theme switch on every view. The Python/Numba compiler stays ready between lessons in the same tab. Each run gets a fresh program namespace and simulator device. Header **Start code runner** prepares the tools without executing the editor. **Free memory** and **Stop run** terminate the worker while preserving saved code, predictions, case selections, completion and previous results. The default idle timeout is 30 minutes; choose 5, 15, 30 or 60 minutes in Code runner.

App status checks for published versions automatically. Normal online reloads use the live course. **Save offline copy** explicitly saves every required file, including recordings, Pyodide, NumPy, Numba and the CUDA compiler. **Update offline copy** stages a newer verified version and offers **Restart to update**. Wait for **Downloaded and ready to use offline** before disconnecting. External links and native GPU tools still need their own connectivity/installations.

**If you have an older course tab open**, pause editing before switching releases. An edit made in the older tab during a save in the new release can be lost. Download the visible code and copy your prediction from each older tab. Then close those tabs or finish **Restart to update**. Reopen the lesson in the updated course and check your work before continuing.

Choose a **Guided task** to open its case and saved program. If the task expects a different starting program, **Prepare starting program** describes the affected kernel or host code and keeps your current program for **Undo preparation**. **Free exploration** retains the shared kernel when you change cases. Each case has its own prediction. An answer from an older multi-case lesson is available under **Earlier lesson prediction**.

When the open editor or prediction differs from the saved version, choose **Review saved version** to inspect what would reopen. **Export learner work** keeps a copy of the open text. Choose **Load reviewed version** when you want to use the saved text in this tab.

See [runner design](docs/code-runner-design.md) and [offline/update design](docs/offline-update-design.md) for ownership, resource reporting, preservation and verification details.

## Numba-CUDA-MLIR

Kernels and GPU notebooks use `from numba_cuda_mlir import cuda` and Numba-CUDA-MLIR 0.6.0. The lessons teach the necessary CUDA API; previous Numba knowledge is not required. The optional **What happens at the first launch?** GPU lab connects compilation to GPU execution, compares first/warm launch times and investigates compiled-function reuse.

The browser uses a documented compatibility compiler, not a native MLIR/WASM build. Saved legacy imports still run; exports adapt recognized CUDA imports without changing stored code. See [migration scope and limitations](docs/numba-cuda-mlir-migration.md). Check actual MLIR PTX compilation without a GPU using `python scripts/check_native.py --ptx --cpu-only` after installing `src/gpu/requirements.txt`; install IPython and use the script without flags on an NVIDIA GPU to execute the native notebooks. [Native notebook verification and platform requirements](docs/native-notebooks.md)
