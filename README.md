# CUDA Python Lab

CUDA Python Lab teaches GPU programming to Python developers through seventeen browser labs that require no physical GPU. It follows the predict, run, and explain format of [CUDA C++ Lab](https://snowch.github.io/cuda-cpp-lab/v2/).

The workbench follows CUDA C++ Lab’s layout and editor tools. Edit Python kernels with CodeMirror, run or stop a case, and use the console to inspect `print()` messages, kernel results, and execution errors. The workbench runs your current source through Pyodide and a course-specific CUDA model. Inspect individual threads, array addresses, shared-memory accesses, and barriers. Compare the full result with the starter reference. Appendix A covers optional GPU verification and profiling with exported notebooks.

## Start the course

Use Node.js 22 or later and Python 3.12.

```sh
npm ci
npm run dev
```

Open [localhost:8000](http://localhost:8000). Predictions, edited kernels, case selections, and completion are stored in the current browser.

| Module | Browser labs |
| --- | --- |
| CUDA foundations | First kernel, bounds checks, grid-stride loops |
| Memory and execution | Host/device transfers, coalescing, warp divergence |
| Parallel patterns | Block reduction, atomic histogram, block scan |
| Reusing data and computing probabilities | Tiled transpose, tiled matrix multiplication, stable softmax |
| Design, debug, and tune kernels | Gather, shared-memory stencil, float32 rounding, synchronization debugging, fusion |

Use `npm run build` to produce the static site in `dist/`. Serve that directory over HTTP. Assets use relative paths and Pyodide is bundled locally, so the course can run from a static host subdirectory with no runtime CDN dependency.

## Run on a GPU

Each lesson can export a notebook with your kernel, an independent NumPy check, CUDA event timing, and a host round-trip measurement. Enable an NVIDIA GPU runtime before running the notebook.

**Appendix A** includes an occupancy worksheet and a downloadable archive. Debug global memory and shared-memory hazards with Compute Sanitizer. Profile streams, transpose, and Numba–PyTorch interoperability. Complete the capstone by comparing a two-launch baseline with a fused kernel across workloads and block sizes. [Native investigations](src/gpu/INVESTIGATIONS.md)

The browser model executes a small CUDA subset in a worker and uses deterministic scheduling within each barrier phase. Its address and value traces are functional teaching tools. Use native compilation, GPU verification, and hardware profiling to study CUDA behavior and speed. [Numba CUDA documentation](https://nvidia.github.io/numba-cuda/)

## Develop and verify

`src/course.mjs` defines the lesson text, launch cases, and references. `src/kernels/` contains the editable CUDA Python sources. `src/simulator.py` traces them in the browser, `src/browser_adapter.py` reports Python console output and execution errors, and `src/notebook.mjs` builds the corresponding notebooks.

```sh
# Install Chromium for Playwright if a system Chromium is unavailable.
npx playwright-core install chromium
npm test

# Verify notebook results with the official Numba CUDA simulator and compile PTX.
python -m venv .venv
source .venv/bin/activate
python -m pip install -r src/gpu/requirements.txt
python scripts/check_native.py
python scripts/check_native.py --ptx
```

The browser tests exercise every starter case and cover the mobile edit, trace, restore, and download flow. Native simulator checks cover exported notebook setup and correctness. Benchmark timings and PyTorch interop require an NVIDIA GPU.
