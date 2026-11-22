# Numba-CUDA-MLIR migration

The learner-facing CUDA API, all seventeen stock kernels, generated host programs, exported notebooks and native investigations use NVIDIA Numba-CUDA-MLIR 0.6.0. Install `numba-cuda-mlir[cu12]==0.6.0`, import `cuda` from `numba_cuda_mlir`, and import scalar types from `numba_cuda_mlir.types`. Python 3.12, CUDA 12 components and a compatible NVIDIA GPU with compute capability 7.0 or later are the documented native path.

NVIDIA places numba-cuda in maintenance mode and recommends MLIR for new development. Sources: [maintenance notice](https://nvidia.github.io/numba-cuda/) and [MLIR migration guidance](https://github.com/NVIDIA/numba-cuda-mlir#Migration-from-Numba--Numba-CUDA). The course defines the library before its first import and teaches the required CUDA features; learners do not need a separate Numba course or MLIR syntax.

## Browser boundary

There is no upstream Pyodide/WebAssembly wheel for the native MLIR compiler in the published 0.6.0 distributions. The browser therefore retains its existing, pinned Numba 0.68.1 LLVM frontend and NVPTX WebAssembly compiler as a **compatibility compiler** for the taught kernel subset, followed by real GPGPU-Sim execution. The host adapter accepts the MLIR import namespace and scalar-type module. This is not native MLIR running in the browser, and browser elapsed time is not NVIDIA GPU performance. The GPU setup appendix explains the distinction. The legacy compiler requirements and wheel-rebuild instructions remain for maintaining that browser backend.

Existing saved programs are kept verbatim. The browser accepts their old `numba` imports. Notebook and Python exports migrate only recognized legacy CUDA/type import statements, without editing stored source. Unknown imports are not silently rewritten. No predictions, case selections, restore history, completion or Console results are reset.

A future full browser compiler migration needs an actual WASM MLIR toolchain, package/runtime integration, native MLIR argument-ABI handling, math support and simulator/PTX compatibility checks. Renaming a compatibility module does not meet those requirements. Do not label the browser backend as migrated until those are implemented and verified.

## Optional compiler lab

The course outline, navigation and GPU appendix link an optional GPU notebook after Vector add. It shows Python → MLIR/PTX → GPU machine code → threads executing on SMs. The notebook compares first-launch time with the median of five warm launches, then reuses the same function with different float32 values and compares compiled-signature counts. Allocation/transfers are outside the timed sections. Timings include CPU launch overhead, waiting and GPU execution, with possible first-launch compilation/initialization. They do not isolate compiler time. Redefining a function would invalidate the reuse comparison, so the value experiment keeps the function unchanged. Reading MLIR IR is not required.

## Validation and limitations

`npm test` checks exports, saved legacy programs, controls and offline/update journeys. `npm run test:runner` executes all lesson cases plus edits/errors through the browser compatibility compiler and GPGPU-Sim using the new import API; its multi-kernel example also checks saved legacy imports.

`python scripts/check_native.py --ptx --cpu-only` cross-compiles every lesson kernel and additional tile/fusion/debugging kernels with the **actual MLIR compiler**. Version 0.6.0 queries a host capability even for explicit-target compilation. The test-only CPU option supplies an SM 8.0 capability fixture via the pinned compiler's cached target, never a simulated claim of GPU presence or execution. A different compiler version requires reviewing that workaround. CI runs this check separately from browser tests.

On a machine with an NVIDIA GPU, `python scripts/check_native.py` executes exported notebooks/programs and native investigations; `--ptx` compiles against its driver/toolkit. Physical GPU execution, timing results, profiler/Compute Sanitizer output and learner effectiveness remain separate from CPU-only compilation and browser functional checks. The MLIR package does not provide the old CUDASIM workflow; no legacy CUDASIM pass is reported as MLIR validation.
