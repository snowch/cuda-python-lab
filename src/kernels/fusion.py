from numba import cuda, float32


@cuda.jit
def kernel(x, y, temp, out, n, alpha, use_temp):
    i = cuda.grid(1)
    if i < n:
        value = float32(alpha * x[i] + y[i])
        if use_temp:
            temp[i] = value
            value = temp[i]
        out[i] = max(value, float32(0))
