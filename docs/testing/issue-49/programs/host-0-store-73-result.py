from numba_cuda_mlir import cuda


@cuda.jit
def kernel(out):
    out[0] = 73


# Host code
def main():
    import numpy as np
    from numba_cuda_mlir import cuda

    out_host = np.zeros(1, dtype=np.float32)
    out = cuda.to_device(out_host)

    kernel[1, 1](out)
    result = out.copy_to_host()
    print("out =", result.tolist())
    return result


if __name__ == "__main__":
    actual = main()
