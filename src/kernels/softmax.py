import math

from numba_cuda_mlir import cuda
from numba_cuda_mlir.types import float32


@cuda.jit
def kernel(values, out, rows, cols):
    scratch = cuda.shared.array(32, dtype=float32)
    row, lane = cuda.blockIdx.x, cuda.threadIdx.x
    if row >= rows:
        return

    local_max = -math.inf
    for col in range(lane, cols, cuda.blockDim.x):
        local_max = max(local_max, values[row, col])
    scratch[lane] = local_max
    cuda.syncthreads()

    distance = cuda.blockDim.x // 2
    while distance > 0:
        if lane < distance:
            scratch[lane] = max(scratch[lane], scratch[lane + distance])
        cuda.syncthreads()
        distance //= 2

    row_max = scratch[0]
    cuda.syncthreads()
    local_sum = float32(0)
    for col in range(lane, cols, cuda.blockDim.x):
        local_sum += math.exp(values[row, col] - row_max)
    scratch[lane] = local_sum
    cuda.syncthreads()

    distance = cuda.blockDim.x // 2
    while distance > 0:
        if lane < distance:
            scratch[lane] += scratch[lane + distance]
        cuda.syncthreads()
        distance //= 2

    for col in range(lane, cols, cuda.blockDim.x):
        out[row, col] = math.exp(values[row, col] - row_max) / scratch[0]
