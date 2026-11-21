from numba import cuda


@cuda.jit
def kernel(values, out, n):
    first = cuda.grid(1)
    stride = cuda.gridDim.x * cuda.blockDim.x
    for i in range(first, n, stride):
        out[i] = values[i] * 2
