# Browser toolchain sources

- Pyodide 0.27.7 comes from npm. The NumPy wheel comes from [Pyodide 0.27.7](https://github.com/pyodide/pyodide/releases/tag/0.27.7) and is checked against the npm package's lockfile.
- The LLVM NVPTX compiler and GPGPU-Sim come from [CUDA C++ Lab V2 at 88237c7](https://github.com/snowch/cuda-cpp-lab/tree/88237c7df5df7a71318f23f73f813c12435a837a/assets/cuda-workbench). Concatenate each asset's parts in the order given in `manifest.json` and compress with `gzip -n`. The site build checks the original SHA-256 hashes and packages the license notices from V2.
- The Numba wheel is a Pyodide build of [Numba 0.68.1](https://github.com/numba/numba/tree/0.68.1), which includes the legacy CUDA frontend. The wheel includes its license.
- `llvmlite-ir.zip` contains the root Python files, the `ir/` Python files, and license from [llvmlite 0.50.0](https://github.com/numba/llvmlite/tree/v0.50.0), stored under `llvmlite/`. The site build adds the binding adapter from `src/wasm-llvm-binding.py`.

## Rebuild the Numba wheel

Install Emscripten 3.1.58 with [emsdk](https://github.com/emscripten-core/emsdk) and source its environment. Use Python 3.12 and run the following from a checkout of Numba's `0.68.1` tag.

```sh
uv tool run --with wheel==0.45.1 --with pip --from pyodide-build==0.27.3 \
  pyodide xbuildenv install --url https://github.com/pyodide/pyodide/releases/download/0.27.7/xbuildenv-0.27.7.tar.gz
NUMBA_DISABLE_OPENMP=1 NUMBA_DISABLE_TBB=1 \
  uv tool run --with wheel==0.45.1 --with pip --from pyodide-build==0.27.3 pyodide build .
```

Copy the resulting wheel into this directory, update its checksum in `scripts/build.mjs`, and run `npm run test:runner`. The browser adapter selects NVPTX64 layouts and compiles for compute capability 7.0. The notebook uses the normal NVIDIA Numba CUDA package.
