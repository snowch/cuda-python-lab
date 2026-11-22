from numba_cuda_mlir import cuda


@cuda.jit
def kernel(values, out, rows, cols):
    col, row = cuda.grid(2)
    if row < rows and col < cols:
        out[col, row] = values[row, col]
