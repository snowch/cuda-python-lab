from numba_cuda_mlir import cuda
from numba_cuda_mlir.types import float32

TILE = 8
PADDING = 1
TILE_STRIDE = TILE + PADDING


@cuda.jit
def kernel(values, out, rows, cols):
    tile = cuda.shared.array((TILE, TILE_STRIDE), dtype=float32)
    tx, ty = cuda.threadIdx.x, cuda.threadIdx.y
    col = cuda.blockIdx.x * TILE + tx
    row = cuda.blockIdx.y * TILE + ty
    if row < rows and col < cols:
        tile[ty, tx] = values[row, col]
    cuda.syncthreads()

    out_row = cuda.blockIdx.x * TILE + ty
    out_col = cuda.blockIdx.y * TILE + tx
    if out_row < cols and out_col < rows:
        out[out_row, out_col] = tile[tx, ty]
