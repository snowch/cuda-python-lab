from numba import cuda


@cuda.jit
def kernel(tokens, counts, n):
    i = cuda.grid(1)
    if i < n:
        cuda.atomic.add(counts, tokens[i], 1)
