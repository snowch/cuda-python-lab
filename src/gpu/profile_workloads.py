"""Verify and benchmark three course investigations on an NVIDIA GPU."""

import argparse
from statistics import median
from time import perf_counter

import numpy as np
from numba import cuda, float32

from kernels.coalescing import kernel as direct_transpose
from kernels.softmax import kernel as block_softmax
from kernels.transfers import kernel as affine_kernel


TILE = 32
BLOCK_ROWS = 8


def make_tiled_transpose(padding):
    stride = TILE + padding

    @cuda.jit
    def tiled_transpose(values, out, rows, cols):
        tile = cuda.shared.array((TILE, stride), dtype=float32)
        tx, ty = cuda.threadIdx.x, cuda.threadIdx.y
        col = cuda.blockIdx.x * TILE + tx
        input_base = cuda.blockIdx.y * TILE + ty
        for offset in range(0, TILE, BLOCK_ROWS):
            row = input_base + offset
            if row < rows and col < cols:
                tile[ty + offset, tx] = values[row, col]
        cuda.syncthreads()

        output_col = cuda.blockIdx.y * TILE + tx
        output_base = cuda.blockIdx.x * TILE + ty
        for offset in range(0, TILE, BLOCK_ROWS):
            output_row = output_base + offset
            if output_row < cols and output_col < rows:
                out[output_row, output_col] = tile[tx, ty + offset]

    return tiled_transpose


def ceil_div(value, width):
    return (value + width - 1) // width


def gpu_time_ms(enqueue, repeats, stream=0):
    enqueue()
    cuda.synchronize()
    start, end = cuda.event(), cuda.event()
    samples = []
    for _ in range(repeats):
        start.record(stream)
        enqueue()
        end.record(stream)
        end.synchronize()
        samples.append(cuda.event_elapsed_time(start, end))
    return median(samples)


def host_time_ms(run, repeats):
    run()
    samples = []
    for _ in range(repeats):
        before = perf_counter()
        run()
        samples.append((perf_counter() - before) * 1000)
    return median(samples)


def chunked_affine(x, y, alpha, chunk_elements, stream_count):
    """Return a runner whose per-stream device buffers are reused in queue order."""
    size = len(x)
    pinned_x = cuda.pinned_array_like(x)
    pinned_y = cuda.pinned_array_like(y)
    pinned_out = cuda.pinned_array_like(x)
    pinned_x[:] = x
    pinned_y[:] = y
    lanes = [
        (cuda.stream(), *(cuda.device_array(chunk_elements, dtype=x.dtype) for _ in range(3)))
        for _ in range(stream_count)
    ]

    def run():
        for chunk, start in enumerate(range(0, size, chunk_elements)):
            end = min(start + chunk_elements, size)
            count = end - start
            stream, dx, dy, dout = lanes[chunk % stream_count]
            dx[:count].copy_to_device(pinned_x[start:end], stream=stream)
            dy[:count].copy_to_device(pinned_y[start:end], stream=stream)
            affine_kernel[ceil_div(count, 128), 128, stream](dx, dy, dout, count, alpha)
            dout[:count].copy_to_host(pinned_out[start:end], stream=stream)
        for stream, *_ in lanes:
            stream.synchronize()

    return run, pinned_out


def profile_affine(args):
    print("Elements   Kernel (ms)   Round trip (ms)   1 stream (ms)   2 streams (ms)")
    rng = np.random.default_rng(17)
    alpha = np.float32(2.5)
    for size in args.sizes:
        x, y = (rng.random(size, dtype=np.float32) for _ in range(2))
        expected = alpha * x + y
        dx, dy = cuda.to_device(x), cuda.to_device(y)
        dout = cuda.device_array_like(dx)
        actual = np.empty_like(x)

        def kernel():
            affine_kernel[ceil_div(size, 128), 128](dx, dy, dout, size, alpha)

        def round_trip():
            dx.copy_to_device(x)
            dy.copy_to_device(y)
            kernel()
            dout.copy_to_host(actual)

        round_trip()
        np.testing.assert_allclose(actual, expected, rtol=1e-5, atol=1e-6)
        chunk = max(1, ceil_div(size, 4))
        pipeline_times = []
        for streams in (1, 2):
            run, output = chunked_affine(x, y, alpha, chunk, streams)
            run()
            np.testing.assert_allclose(output, expected, rtol=1e-5, atol=1e-6)
            pipeline_times.append(host_time_ms(run, args.repeats))
        print(f"{size:8,d} {gpu_time_ms(kernel, args.repeats):13.4f} "
              f"{host_time_ms(round_trip, args.repeats):17.4f} "
              f"{pipeline_times[0]:15.4f} {pipeline_times[1]:16.4f}")
    print("Round trip uses pageable host arrays. Both pipelines use the same pinned-buffer chunk size.")


def profile_transpose(args):
    rng = np.random.default_rng(17)
    rows, cols = args.rows, args.cols
    values = rng.random((rows, cols), dtype=np.float32)
    source = cuda.to_device(values)
    dest = cuda.device_array((cols, rows), dtype=np.float32)
    block = (TILE, BLOCK_ROWS)
    variants = (
        ("direct", direct_transpose, (ceil_div(cols, TILE), ceil_div(rows, BLOCK_ROWS))),
        ("tiled", make_tiled_transpose(0), (ceil_div(cols, TILE), ceil_div(rows, TILE))),
        ("tiled + padding", make_tiled_transpose(1), (ceil_div(cols, TILE), ceil_div(rows, TILE))),
    )
    print(f"Input {rows:,} × {cols:,} float32")
    for name, kernel, grid in variants:
        def enqueue():
            kernel[grid, block](source, dest, rows, cols)

        enqueue()
        np.testing.assert_array_equal(dest.copy_to_host(), values.T)
        elapsed = gpu_time_ms(enqueue, args.repeats)
        bandwidth = 2 * values.nbytes / (max(elapsed, 1e-9) * 1e6)
        print(f"{name:16} {elapsed:10.4f} ms   {bandwidth:10.2f} effective GB/s")
    print("Effective bandwidth uses one input read and one output write per element.")


def profile_softmax(args):
    try:
        import torch
    except ImportError as error:
        raise SystemExit("Install a CUDA-enabled PyTorch build to run this investigation.") from error

    if not torch.cuda.is_available():
        raise SystemExit("PyTorch cannot access an NVIDIA GPU.")
    torch.manual_seed(17)
    rows, cols = args.rows, args.cols
    values = torch.randn((rows, cols), dtype=torch.float32, device="cuda")
    values[0] += 1000
    if rows > 1:
        values[1].fill_(-1000)
    actual = torch.empty_like(values)
    expected = torch.empty_like(values)
    stream = cuda.external_stream(torch.cuda.current_stream().cuda_stream)
    # The tensors are contiguous, live through both launches, and use this same stream.
    device_in = cuda.as_cuda_array(values, sync=False)
    device_out = cuda.as_cuda_array(actual, sync=False)

    def launch():
        block_softmax[rows, 32, stream](device_in, device_out, rows, cols)

    def baseline():
        torch.softmax(values, dim=1, out=expected)

    launch()
    baseline()
    torch.cuda.synchronize()
    torch.testing.assert_close(actual, expected, rtol=1e-5, atol=1e-6)
    torch.testing.assert_close(actual.sum(dim=1), torch.ones(rows, device="cuda"))
    print(f"Input {rows:,} × {cols:,} float32")
    print(f"Numba kernel:  {gpu_time_ms(launch, args.repeats, stream):.4f} ms")
    print(f"torch.softmax: {gpu_time_ms(baseline, args.repeats, stream):.4f} ms")


def positive_int(value):
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("use a positive integer")
    return parsed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="investigation", required=True)
    affine = subparsers.add_parser("affine", help="Measure host/device transfers and asynchronous overlap.")
    affine.add_argument("--sizes", type=positive_int, nargs="+", default=[4096, 1048576])
    affine.set_defaults(run=profile_affine)
    transpose = subparsers.add_parser("transpose", help="Compare direct, tiled, and padded transpose.")
    transpose.add_argument("--rows", type=positive_int, default=2049)
    transpose.add_argument("--cols", type=positive_int, default=4093)
    transpose.set_defaults(run=profile_transpose)
    softmax = subparsers.add_parser("softmax", help="Compare a Numba kernel with torch.softmax.")
    softmax.add_argument("--rows", type=positive_int, default=4096)
    softmax.add_argument("--cols", type=positive_int, default=129)
    softmax.set_defaults(run=profile_softmax)
    for command in (affine, transpose, softmax):
        command.add_argument("--repeats", type=positive_int, default=30)
    args = parser.parse_args()

    if cuda.config.ENABLE_CUDASIM or not cuda.is_available():
        parser.exit(1, "An NVIDIA GPU and a compatible CUDA 12 driver are required for these timings.\n")
    print(f"GPU: {cuda.get_current_device().name}")
    args.run(args)


if __name__ == "__main__":
    main()
