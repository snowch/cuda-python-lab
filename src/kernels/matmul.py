from numba_cuda_mlir import cuda
from numba_cuda_mlir.types import float32

TILE = 4


@cuda.jit
def kernel(a, b, out, m, k, n):
    tx, ty = cuda.threadIdx.x, cuda.threadIdx.y
    col, row = cuda.grid(2)
    tile_a = cuda.shared.array((TILE, TILE), dtype=float32)
    tile_b = cuda.shared.array((TILE, TILE), dtype=float32)
    total = float32(0)

    for start in range(0, k, TILE):
        a_col = start + tx
        b_row = start + ty
        tile_a[ty, tx] = a[row, a_col] if row < m and a_col < k else 0
        tile_b[ty, tx] = b[b_row, col] if b_row < k and col < n else 0
        cuda.syncthreads()
        for offset in range(TILE):
            total += tile_a[ty, offset] * tile_b[offset, tx]
        cuda.syncthreads()

    if row < m and col < n:
        out[row, col] = total
