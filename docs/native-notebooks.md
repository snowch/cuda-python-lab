# Native lesson notebooks

Download a lesson once. Run **Set up this notebook** in an IPython kernel, then run the program immediately below the case or task you want. Each program cell starts with `%%experiment lesson case task`. It runs that cell's full Python source in a fresh namespace and checks the array it assigns to `actual`. The case, task and source fingerprint appear alongside the output. A failed execution has no result to check. Output already displayed underneath a cell belongs to its previous execution until you rerun it.

**Your exported program** contains the selected editor's kernel and host, with the course's recognized native import adaptation. The other cells contain authored starting programs, including required earlier edits. Changing one cell leaves all the others intact. Duplicate a cell to keep a before/after comparison. To recover the supplied version, print `lab_start(case_id, task_id)` in a new Python cell and copy its output into a duplicate below the magic line. To retain all browser drafts, use **Editor tools → Export all learner work** before leaving the course.

The checker reports shape, dtype, finite/NaN policy and value comparisons. It checks the authored secondary prints where the experiment calls for them. When a task starts with earlier edits, its starting check uses the result of those edits. A verified starting result is the point at which to make the requested change. For a non-atomic histogram it records an in-bounds observation. Rerun after restoring atomic addition to check the exact counters. A changed return value can satisfy its own objective while differing from the starter. A matching array does not show whether an operation was atomic, whether a warp diverged, or how long a transfer took. Arbitrary Python runs in the notebook's normal trust environment. A custom program without a matched reference receives an unassessed objective.

## Platform targets and current evidence

| Target | Select or inspect first | Evidence for this release |
| --- | --- | --- |
| Colab | Select a GPU runtime, inspect its GPU, Python and CUDA versions in setup, then review the package plan. GPU model and availability vary. | The notebook uses standard IPython cell magics. Hosted Colab allocation and execution require a physical run. |
| Local NVIDIA GPU | Use an isolated Python environment, a CUDA 12 compatible driver, and a supported compute capability. Register the same environment as the Jupyter kernel. | The pinned backend installed on Linux x86-64 and cross-compiled PTX there. Driver loading and a real kernel launch are separate checks. |
| Jetson Orin Nano Super | Record the JetPack/L4T release, Python ABI and installed CUDA runtime. Use the Jetson environment and driver delivered for that board. | PyPI supplies an ARM64 CPython 3.12 wheel for MLIR 0.6.0. A Linux ARM64 dependency resolution for cu12 succeeded for Python 3.12. The same MLIR pin did not resolve for CPython 3.10. These are package checks on an x86 host. JetPack installation and physical SM 8.7 execution remain open. |

Numba-CUDA-MLIR 0.6.0 documents support starting at compute capability 7.0 with suitable CUDA 12 toolkits. A GPU within that range still needs compatible drivers, runtime libraries and packages. The reported driver CUDA API version describes driver capability. The runtime version identifies the loaded user-space CUDA runtime. They can differ. [Upstream installation requirements at v0.6.0](https://github.com/NVIDIA/numba-cuda-mlir/blob/v0.6.0/docs/source/user/installation.rst) · [Pinned release files](https://pypi.org/project/numba-cuda-mlir/0.6.0/#files)

For a Python 3.10 JetPack environment, the separate maintenance backend `numba-cuda[cu12]==0.30.4` has an ARM64 packaging path. Its wheel set resolved in the cross-platform package check. Its imports and compiler differ. The exported notebooks use MLIR. A fallback port must explicitly adapt imports, run the same fixtures and task checks on the device, and qualify compilation, numerics and tool support before it can be offered to learners. Do not install a second backend over a working JetPack environment to make this test. [Numba-CUDA release files](https://pypi.org/project/numba-cuda/0.30.4/#files) · [Approved platform direction](https://github.com/snowch/cuda-python-lab/issues/43)

## Physical verification on Colab, local Linux or Jetson

1. Record the device model, OS/kernel, machine architecture and Python version. On Jetson also record `cat /etc/nv_tegra_release` and `dpkg-query -W nvidia-l4t-core`. If available, record `nvcc --version` and the driver version from `nvidia-smi`. Availability of desktop tools varies on Jetson.
2. In an isolated target environment, run the commands below from the checkout. Inspect the pip plan before installation. On Colab, use the notebook's `%pip` instructions in the selected GPU runtime and restart the kernel after changing packages. If a wheel, driver or shared library is incompatible, retain the exact error and platform versions.
3. Open the first-value notebook. Run setup and capture its report. Execute the saved program, check the float32 value 42, change the authored write to 73 and rerun its task. Run the precision regrouping and unstable softmax tasks. Keep the objective report, source fingerprint, returned values, shapes and dtypes. Switch to another case and back. Rerunning a cell should leave the text of the other cells intact.
4. With Node installed for fixture generation, run `python scripts/check_native.py` on the same device. It executes the exported programs for all 38 cases, the guided notebook starts and targets, and the existing native investigations. Record the exit status and complete output. The separate `--ptx --cpu-only` option cross-compiles for an explicit SM 8.0 target and launches no GPU kernels.
5. Keep an evidence record per device. On Jetson, record shared physical DRAM capacity and JetPack version. Logical CUDA memory spaces still have distinct semantics. Mark CUDA events, streams, profiler permissions, Compute Sanitizer, library interoperability and optional AI operations individually as observed, unavailable or untested. A pass in one of these areas does not verify the others. No hardware timing comparison is required for this milestone.

```sh
python -VV
uname -smr
python -m pip install --dry-run -r src/gpu/requirements.txt
# After reviewing the plan for this device and activating the intended environment
python -m pip install -r src/gpu/requirements.txt ipykernel nbformat
python scripts/check_native.py --preflight
python tests/test_notebooks.py
python scripts/check_native.py
```

The browser course retains its bundled compiler, simulator and offline assets. Its exercises and downloads do not require any native setup. [Regression evidence](testing/issue-47/README.md)
