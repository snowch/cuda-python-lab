from numba_cuda_mlir import cuda


@cuda.jit
def kernel(x, y, out, n, alpha):
    i = cuda.grid(1)
    if i < n:
        out[i] = alpha * x[i] + y[i]
