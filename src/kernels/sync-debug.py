from numba import cuda, int32


@cuda.jit
def kernel(out, n):
    i = cuda.grid(1)
    lane = cuda.threadIdx.x
    slot = cuda.shared.array(4, dtype=int32)
    slot[lane] = i if i < n else -1
    cuda.syncthreads()
    if i < n:
        out[i] = slot[(lane + 1) % 4]
