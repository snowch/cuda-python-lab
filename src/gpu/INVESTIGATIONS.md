# CUDA Python GPU investigations

Use Python 3.12 and an NVIDIA driver compatible with the CUDA 12 toolkit installed by the requirements. These scripts use the same kernels as the lessons where possible and allocate larger datasets for profiling.

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Measure an affine transform

```sh
python profile_workloads.py affine --sizes 256 4096 1048576 4194304
nsys profile -o affine --trace=cuda python profile_workloads.py affine --sizes 1048576 --repeats 10
```

All implementations compute `out = alpha * x + y` and check the full output against NumPy. The resident-kernel column measures CUDA events after allocation, and the synchronous round trip times host-to-device and device-to-host copies with a host clock. The last two columns use pinned host arrays, identical chunk sizes, and either one or two streams. Only compare those two columns to isolate the stream count. A stream orders uploads, a kernel, and a download for each chunk. Two streams may overlap work depending on the hardware, transfer sizes, and available copy engines.

1. Predict which input sizes will be dominated by launch and transfer overhead.
2. Record median times and the GPU name. In the Nsight Systems timeline find the uploads, kernel, and downloads for a chunk, then check whether any work overlaps across streams.
3. Adjust the chunk size in `profile_affine` and explain how launch overhead and overlap change.

## Explain a transpose optimization

```sh
python profile_workloads.py transpose --rows 2049 --cols 4093
ncu --section MemoryWorkloadAnalysis python profile_workloads.py transpose --rows 2049 --cols 4093 --repeats 1
```

The direct kernel reads consecutive inputs and writes strided destinations. The shared-memory variants use a 32 × 8 block; each thread handles four values in a 32 × 32 or 32 × 33 tile. The 33-word row stride changes how shared reads map to banks. Edge threads still reach the barrier.

1. Predict which variant has fewer global store sectors and which has fewer shared load bank conflicts.
2. Compare effective bandwidth for square, rectangular, and uneven dimensions. Verify all outputs against NumPy before interpreting a speedup.
3. In Nsight Compute, identify the three kernels by name and inspect global sectors and shared-memory bank conflicts. Filter kernels or launches as needed for your version. Explain differences between the logical browser address model and measured GPU transactions.

## Integrate a stable softmax with PyTorch

Install a CUDA-enabled PyTorch wheel using the [PyTorch installation selector](https://pytorch.org/get-started/locally/). The shared CUDA stream orders the Numba and PyTorch work on the same tensor buffers. CUDA array interface views avoid copying the tensors. Keep the original tensors alive and share only compatible shape, dtype, and layout.

```sh
python profile_workloads.py softmax --rows 4096 --cols 129
python profile_workloads.py softmax --rows 1024 --cols 4097
```

1. Explain why subtracting each row’s maximum protects the exponential. Check rows with one column, equal logits, and values near +1,000 and −1,000.
2. Compare the same FP32 inputs with `torch.softmax`. Sweep across shapes smaller and larger than a warp. Keep both timings on the same stream and verify probabilities and row sums.
3. Identify repeated global reads and synchronization by tracing the browser kernel. Propose a change that would reduce traffic or improve parallelism, then measure it before drawing a conclusion.

Use [Nsight Systems](https://developer.nvidia.com/nsight-systems) to study the timeline and [Nsight Compute](https://developer.nvidia.com/nsight-compute) for kernel-level counters. Drivers, clocks, GPU architectures, and profiler versions can affect your measurements.
