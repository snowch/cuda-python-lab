from numba import cuda, float32


@cuda.jit
def kernel(values, out, n):
    scratch = cuda.shared.array(32, dtype=float32)
    lane = cuda.threadIdx.x
    i = cuda.grid(1)
    scratch[lane] = values[i] if i < n else 0.0
    cuda.syncthreads()

    distance = cuda.blockDim.x // 2
    while distance > 0:
        if lane < distance:
            scratch[lane] += scratch[lane + distance]
        cuda.syncthreads()
        distance //= 2

    if lane == 0:
        out[cuda.blockIdx.x] = scratch[0]
