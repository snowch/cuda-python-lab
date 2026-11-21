from numba import cuda


@cuda.jit
def kernel(out):
    out[0] = 42
