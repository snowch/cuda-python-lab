from numba_cuda_mlir import cuda
from numba_cuda_mlir.types import int32


@cuda.jit
def kernel(values, out, n):
    scratch = cuda.shared.array(32, dtype=int32)
    lane = cuda.threadIdx.x
    scratch[lane] = values[lane] if lane < n else 0
    cuda.syncthreads()

    distance = 1
    while distance < cuda.blockDim.x:
        previous = scratch[lane - distance] if lane >= distance else 0
        cuda.syncthreads()
        if lane >= distance:
            scratch[lane] += previous
        cuda.syncthreads()
        distance *= 2

    if lane < n:
        out[lane] = scratch[lane]
