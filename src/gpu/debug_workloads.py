"""Run small examples with NVIDIA Compute Sanitizer."""

import argparse

import numpy as np
from numba_cuda_mlir import cuda
from numba_cuda_mlir.types import int32


debug_kernel = cuda.jit(lineinfo=True)


@debug_kernel
def write_indices(out, faulty):
    i = cuda.grid(1)
    if faulty or i < out.size:
        out[i] = i


@debug_kernel
def shared_handoff(out, faulty):
    lane = cuda.threadIdx.x
    slot = cuda.shared.array(64, dtype=int32)
    slot[lane] = lane
    if not faulty:
        cuda.syncthreads()
    out[lane] = slot[(lane + 32) % 64]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("example", choices=["bounds", "shared"])
    parser.add_argument("--faulty", action="store_true", help="Enable the fault for a Compute Sanitizer run.")
    args = parser.parse_args()
    if not cuda.is_available():
        parser.exit(1, "An NVIDIA GPU is required for this debugging exercise.\n")
    if args.example == "bounds":
        out = cuda.device_array(33, dtype=np.int32)
        write_indices[2, 32](out, args.faulty)
        expected = np.arange(33, dtype=np.int32)
    else:
        out = cuda.device_array(64, dtype=np.int32)
        shared_handoff[1, 64](out, args.faulty)
        expected = (np.arange(64, dtype=np.int32) + 32) % 64
    cuda.synchronize()
    if not args.faulty:
        np.testing.assert_array_equal(out.copy_to_host(), expected)
        print("Output matches the CPU reference.")
    else:
        print("Inspect the Compute Sanitizer report for the selected fault.")


if __name__ == "__main__":
    main()
