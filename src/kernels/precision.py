from numba_cuda_mlir import cuda
from numba_cuda_mlir.types import float32


@cuda.jit
def kernel(a, b, c, out, n):
    i = cuda.grid(1)
    if i < n:
        first = float32(a[i] + b[i])
        out[i] = float32(first + c[i])
