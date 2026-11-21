from numba import cuda


@cuda.jit
def kernel(values, indices, out, n):
    i = cuda.grid(1)
    if i < n:
        out[i] = values[indices[i]]
