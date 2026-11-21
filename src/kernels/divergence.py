from numba import cuda


@cuda.jit
def kernel(values, out, n):
    i = cuda.grid(1)
    if i < n:
        x = values[i]
        if x < 0:
            out[i] = x * 0.25
        else:
            out[i] = x
