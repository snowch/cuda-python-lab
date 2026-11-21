# CUDA Python GPU investigations

Use Python 3.12 and a machine with an NVIDIA GPU and a driver compatible with CUDA 12. Open a terminal in the extracted investigations directory. The scripts use larger inputs than the browser cases to measure performance.

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

All implementations compute `out = alpha * x + y` and check the full output against NumPy. Kernel (ms) times the calculation with the arrays already on the GPU. Round trip (ms) includes copying the arrays to the GPU, running the kernel, and copying the result back. Compare 1 stream (ms) with 2 streams (ms) to isolate the stream count. These two runs use the same chunk size and pinned host buffers, which are held in place in CPU memory for transfers. A stream orders the upload, kernel, and download for each chunk. Whether two streams overlap work depends on the transfer size and the GPU’s copy engines.

1. Predict which input sizes will be dominated by launch and transfer overhead.
2. Record median times and the GPU name. In the Nsight Systems timeline find the uploads, kernel, and downloads for a chunk, then check whether any work overlaps across streams.
3. In `profile_workloads.py`, find `chunk = max(1, ceil_div(size, 4))` in `profile_affine`. Change 4 to 8 and repeat the same command. Compare the two stream timings and check the timeline for more launches and any change in overlap.

## Explain a transpose optimization

```sh
python profile_workloads.py transpose --rows 2049 --cols 4093
ncu --section MemoryWorkloadAnalysis python profile_workloads.py transpose --rows 2049 --cols 4093 --repeats 1
```

The direct kernel reads consecutive input values and writes to different rows of the output. The distance between those writes is the output row length. The shared-memory variants use a 32 × 8 block; each thread handles four values in a 32 × 32 or 32 × 33 tile. The 33-word row stride changes how shared reads map to banks. Edge threads still reach the barrier.

1. Predict which variant has fewer global store sectors and which has fewer shared load bank conflicts.
2. Run the command at 2048 × 2048, 2048 × 4096, and 2049 × 4093. Compare effective GB/s after each kernel passes its NumPy check. Effective bandwidth counts one input read and one output write per element. It is calculated from the elapsed time.
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
