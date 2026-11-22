from numba_cuda_mlir import cuda


@cuda.jit
def kernel(a, b, out, n):
    i = cuda.grid(1)
    if i < n:
        out[i] = a[i] + b[i]
