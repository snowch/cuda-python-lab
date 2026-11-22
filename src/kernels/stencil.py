from numba_cuda_mlir import cuda
from numba_cuda_mlir.types import float32

WIDTH = 8
TILE_WIDTH = WIDTH + 2


@cuda.jit
def kernel(values, out, n, use_shared):
    i = cuda.grid(1)
    lane = cuda.threadIdx.x
    if use_shared:
        tile = cuda.shared.array(TILE_WIDTH, dtype=float32)
        tile[lane + 1] = values[i] if i < n else 0.0
        if lane == 0:
            tile[0] = values[i - 1] if i > 0 else 0.0
        if lane == WIDTH - 1:
            tile[WIDTH + 1] = values[i + 1] if i + 1 < n else 0.0
        cuda.syncthreads()
        if i < n:
            out[i] = tile[lane] + tile[lane + 1] + tile[lane + 2]
    elif i < n:
        left = values[i - 1] if i > 0 else 0.0
        right = values[i + 1] if i + 1 < n else 0.0
        out[i] = left + values[i] + right
