# CUDA Python GPU investigations

Use Python 3.12, Numba-CUDA-MLIR 0.6.0, and an NVIDIA GPU with compute capability 7.0 or later and a CUDA 12-compatible driver. Open a terminal in the extracted investigations directory. The scripts use larger inputs than the browser cases to measure performance.

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

Install a CUDA-enabled PyTorch wheel using the [PyTorch installation selector](https://pytorch.org/get-started/locally/). The shared CUDA stream orders the Numba-CUDA-MLIR and PyTorch work on the same tensor buffers. CUDA array interface views avoid copying the tensors. Keep the original tensors alive and share only compatible shape, dtype, and layout.

```sh
python profile_workloads.py softmax --rows 4096 --cols 129
python profile_workloads.py softmax --rows 1024 --cols 4097
```

1. Explain why subtracting each row’s maximum protects the exponential. Check rows with one column, equal logits, and values near +1,000 and −1,000.
2. Compare the same FP32 inputs with `torch.softmax`. Sweep across shapes smaller and larger than a warp. Keep both timings on the same stream and verify probabilities and row sums.
3. Identify repeated global reads and synchronization by tracing the browser kernel. Propose a change that would reduce traffic or improve parallelism, then measure it before drawing a conclusion.

Use [Nsight Systems](https://developer.nvidia.com/nsight-systems) to study the timeline and [Nsight Compute](https://developer.nvidia.com/nsight-compute) for kernel-level counters. Drivers, clocks, GPU architectures, and profiler versions can affect your measurements.

## Find incorrect memory accesses and synchronization

Install [NVIDIA Compute Sanitizer](https://docs.nvidia.com/compute-sanitizer/ComputeSanitizer/index.html). Run both versions under the same checker. The optional `--faulty` flag selects an intentionally incorrect kernel path for the debugger.

```sh
compute-sanitizer --tool memcheck --error-exitcode 1 python debug_workloads.py bounds --faulty
compute-sanitizer --tool memcheck --error-exitcode 1 python debug_workloads.py bounds
compute-sanitizer --tool racecheck --error-exitcode 1 python debug_workloads.py shared --faulty
compute-sanitizer --tool racecheck --error-exitcode 1 python debug_workloads.py shared
```

1. The bounds case launches 64 threads for a 33-element output. In the faulty report, find the invalid global write in `write_indices`. Identify the bounds check that limits writes to indices 0–32. In the corrected run, check the diagnostic summary and the CPU-reference message.
2. The shared case starts 64 threads in one block. Each thread hands its value to a thread in the other warp. In the faulty report, look for a shared-memory read-after-write hazard in `shared_handoff`. Find where the corrected version waits for all writes. Compare the corrected report and output check with the faulty result.
3. Use `compute-sanitizer --tool synccheck --error-exitcode 1 python debug_workloads.py shared` to check the corrected version’s synchronization. Memcheck checks memory accesses, racecheck checks shared-memory hazards, and synccheck checks synchronization primitives. A clean run covers the paths and inputs you exercised.

## Profiling capstone. Compare two launches with a fused kernel

The calculation is `out = max(alpha * x + y, 0)` for each element. The baseline runs two kernels and stores a temporary. Both launches use the same CUDA stream, which orders the first kernel’s writes before the second kernel reads them. The fused kernel keeps the value local to a thread. Both versions start with the same device arrays and pass a NumPy check. Timed work uses CUDA events and excludes allocation, transfers, and warmup. Both versions receive the same preallocated buffers. Only the baseline uses the temporary.

```sh
python profile_workloads.py fusion --sizes 4096 1048583 4194304 --threads 64 128 256
nsys profile -o fusion --trace=cuda python profile_workloads.py fusion --sizes 1048583 --threads 128 --repeats 3
ncu --section LaunchStats --section Occupancy --section SpeedOfLight python profile_workloads.py fusion --sizes 1048583 --threads 128 --repeats 1
```

1. Predict which design accesses fewer bytes. The two-launch version reads x, y, and temp and writes temp and out. The fused version reads x and y and writes out. Each value is four bytes. Check your prediction against **Model bytes/element**. This is a count of array reads and writes in the source. A profiler measures traffic through the actual memory hierarchy.
2. Compare **Median GPU ms** at the same size and threads per block. Compute baseline time divided by fused time. Does the ratio change when the launch contains only a few blocks? Check the Nsight Systems timeline for the extra launch. Use the CUDA event measurements outside profiler runs for the timing comparison.
3. Compare **Registers/thread** with Nsight Compute’s launch and occupancy sections. Register counts for the two-launch version apply to each launch individually. Find the active warps relative to the GPU’s limit. Determine whether the candidate that keeps more warps active is also the fastest at the same input size. Use the SpeedOfLight section to compare compute and memory throughput as fractions of the device peaks. Interpret the throughput alongside the elapsed time and the launch timeline.
4. Save the GPU, toolkit and package versions, command, element count, threads per block, correctness result, and both median times. Repeat at a different input size. If another GPU is available, repeat there and describe which conclusions hold across both devices.

Use the [NVIDIA profiling guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html) for counter definitions and the [CUDA programming guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/) for launch limits. To extend the capstone to an application, measure host-to-device and device-to-host copies separately using the affine investigation.
