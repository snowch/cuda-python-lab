from numba_cuda_mlir import cuda


@cuda.jit
def kernel(out):
    out[0] = 42
