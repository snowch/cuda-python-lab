const range = (length) => Array.from({ length }, (_, i) => i);
const ceil = (n, width) => Math.ceil(n / width);
const buffer = (values, shape = [values.length], dtype = "float32") => ({ values, shape, dtype });
const zeros = (shape, dtype) => buffer(Array(shape.reduce((a, b) => a * b, 1)).fill(0), shape, dtype);
const fixture = (buffers, output, args, scalars, blocks, threads, expected) => ({
  buffers, output, args, scalars, blocks, threads, expected,
});
const caseOf = (id, label, data) => ({ id, label, ...data });
const vector = (size, width) => {
  const a = range(size).map((i) => i + 1);
  const b = a.map((i) => i * 2);
  return fixture({ a: buffer(a), b: buffer(b), out: zeros([size]) }, "out",
    ["a", "b", "out", "n"], { n: size }, [ceil(size, width)], [width], a.map((v, i) => v + b[i]));
};
const stride = (size, width) => {
  const values = range(size).map((i) => i + 1);
  return fixture({ values: buffer(values), out: zeros([size]) }, "out",
    ["values", "out", "n"], { n: size }, [2], [width], values.map((v) => v * 2));
};
const affine = (size) => {
  const x = range(size).map((i) => i / 2);
  const y = x.map((v) => 1 - v);
  const alpha = 2.5;
  return { ...fixture({ x: buffer(x), y: buffer(y), out: zeros([size]) }, "out",
    ["x", "y", "out", "n", "alpha"], { n: size, alpha }, [ceil(size, 32)], [32],
    x.map((v, i) => alpha * v + y[i])), allocateOutput: true };
};
const transpose = (rows, cols, tileX, tileY) => {
  const values = range(rows * cols).map((i) => i + 1);
  return fixture({ values: buffer(values, [rows, cols]), out: zeros([cols, rows]) }, "out",
    ["values", "out", "rows", "cols"], { rows, cols },
    [ceil(cols, tileX), ceil(rows, tileY)], [tileX, tileY],
    range(rows * cols).map((i) => values[(i % rows) * cols + Math.floor(i / rows)]));
};
const divergence = (values) => {
  const n = values.length;
  return fixture({ values: buffer(values), out: zeros([n]) }, "out",
    ["values", "out", "n"], { n }, [ceil(n, 32)], [32], values.map((v) => v < 0 ? v * 0.25 : v));
};
const reduction = (n, width) => {
  const values = range(n).map((i) => i + 1);
  const blocks = ceil(n, width);
  return fixture({ values: buffer(values), out: zeros([blocks]) }, "out",
    ["values", "out", "n"], { n }, [blocks], [width],
    range(blocks).map((i) => values.slice(i * width, (i + 1) * width).reduce((a, b) => a + b, 0)));
};
const histogram = (tokens) => {
  const n = tokens.length;
  return fixture({ tokens: buffer(tokens, [n], "int32"), counts: zeros([4], "int32") }, "counts",
    ["tokens", "counts", "n"], { n }, [ceil(n, 16)], [16],
    range(4).map((i) => tokens.filter((token) => token === i).length));
};
const scan = (values, width) => {
  let sum = 0;
  return fixture({ values: buffer(values, [values.length], "int32"), out: zeros([values.length], "int32") },
    "out", ["values", "out", "n"], { n: values.length }, [1], [width], values.map((v) => sum += v));
};
const matmul = (m, k, n) => {
  const a = range(m * k).map((i) => i % 7 - 2);
  const b = range(k * n).map((i) => (i % 5 + 1) / 2);
  const expected = range(m * n).map((i) => range(k).reduce((sum, offset) =>
    sum + a[Math.floor(i / n) * k + offset] * b[offset * n + i % n], 0));
  return fixture({ a: buffer(a, [m, k]), b: buffer(b, [k, n]), out: zeros([m, n]) }, "out",
    ["a", "b", "out", "m", "k", "n"], { m, k, n }, [ceil(n, 4), ceil(m, 4)], [4, 4], expected);
};
const softmax = (matrix) => {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const expected = matrix.flatMap((row) => {
    const max = Math.max(...row);
    const exps = row.map((v) => Math.exp(v - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / total);
  });
  return fixture({ values: buffer(matrix.flat(), [rows, cols]), out: zeros([rows, cols]) }, "out",
    ["values", "out", "rows", "cols"], { rows, cols }, [rows], [32], expected);
};

const gather = (positions) => {
  const n = positions.length;
  const values = range(64).map((i) => 100 + i);
  return fixture({ values: buffer(values), indices: buffer(positions, [n], "int32"), out: zeros([n]) },
    "out", ["values", "indices", "out", "n"], { n }, [1], [8], positions.map((index) => values[index]));
};
const stencil = (n, useShared) => {
  const values = range(n).map((i) => i + 1);
  return fixture({ values: buffer(values), out: zeros([n]) }, "out",
    ["values", "out", "n", "use_shared"], { n, use_shared: useShared }, [ceil(n, 8)], [8],
    values.map((value, i) => (values[i - 1] ?? 0) + value + (values[i + 1] ?? 0)));
};
const precision = (a) => {
  const n = a.length;
  const b = a.map(() => 1);
  const c = a.map((value) => -value);
  return fixture({ a: buffer(a), b: buffer(b), c: buffer(c), out: zeros([n]) }, "out",
    ["a", "b", "c", "out", "n"], { n }, [1], [4],
    a.map((value, i) => Math.fround(Math.fround(value + b[i]) + c[i])));
};
const syncDebug = (n) => fixture({ out: zeros([n], "int32") }, "out", ["out", "n"],
  { n }, [ceil(n, 4)], [4], range(n).map((i) => {
    const next = Math.floor(i / 4) * 4 + (i + 1) % 4;
    return next < n ? next : -1;
  }));
const fusion = (n, useTemp) => {
  const x = range(n).map((i) => i - 4);
  const y = x.map(() => 0.5);
  const alpha = 1.5;
  return fixture({ x: buffer(x), y: buffer(y), temp: zeros([n]), out: zeros([n]) }, "out",
    ["x", "y", "temp", "out", "n", "alpha", "use_temp"], { n, alpha, use_temp: useTemp },
    [ceil(n, 8)], [8], x.map((value, i) => Math.max(0, alpha * value + y[i])));
};

export const modules = [
  {
    title: "CUDA foundations",
    description: "Run your first GPU function and work out how its threads cover an array.",
    lessons: ["first-value", "vector-add", "grid-stride"],
  },
  {
    title: "Memory and execution",
    description: "Count data transfers and see how groups of threads access memory and take branches.",
    lessons: ["transfers", "coalescing", "divergence"],
  },
  {
    title: "Parallel patterns",
    description: "Use cooperating threads to add values, count categories, and compute running totals.",
    lessons: ["reduction", "histogram", "scan"],
  },
  {
    title: "Reusing data and computing probabilities",
    description: "Share values across threads to work with matrices and turn scores into probabilities.",
    lessons: ["tiled-transpose", "matmul", "softmax"],
  },
  {
    title: "Design, debug, and tune kernels",
    description: "Continue after the twelve core labs. Work with indirect indices and neighboring data, test rounding and synchronization, then compare designs with fewer memory accesses.",
    lessons: ["gather", "stencil", "precision", "sync-debug", "fusion"],
  },
];

export const lessons = {
  "first-value": {
    sourceTarget: "42",
    title: "Write your first GPU value",
    summary: "Launch one GPU thread, write one value, and copy the result back to the CPU.",
    intro: [
      "A GPU (graphics processing unit) can run many copies of the same function in parallel. A function launched on the GPU is called a kernel. Each thread executes one copy of the kernel.",
      "Numba-CUDA-MLIR is a library for writing GPU kernels in Python. It compiles a kernel into machine code for an NVIDIA GPU. This course teaches the CUDA features you need as you go; no previous Numba knowledge is needed.",
      { label: "Import the CUDA tools", from: "from numba_cuda_mlir import cuda" },
      "The import makes the library’s kernel and GPU memory tools available as cuda in this program.",
      { label: "Define the kernel", from: "@cuda.jit", through: "out[0] = 42" },
      "@cuda.jit tells the compiler to compile this function as a GPU kernel. The thread running it stores 42 in the first element of out on the GPU.",
      { label: "Launch from main()", from: "kernel[1, 1](out)", through: "result = out.copy_to_host()" },
      "The CPU program is the host and the GPU is the device. This launch runs the kernel on one GPU thread and passes it the device array out. The host then copies the result back.",
    ],
    predict: "The host array starts with [0.0]. The kernel writes 42 to out[0] on the GPU. What does main() print after copying the value back? What will it print if you change 42 to 73?",
    exercise: [
      "Find main() in the program. It creates a CPU array with one float32 value, a 32-bit floating-point number. Which line in main() copies that starting value to the GPU?",
      "Run the starter program and find out = [42.0] in the output.",
      "Change out[0] = 42 to out[0] = 73 and rerun the program. Then add print(out_host.tolist()) just before return result and rerun. Compare the original CPU array with the result copied from the GPU.",
    ],
    explain: "The GPU thread writes to a separate device array. The original CPU array still holds zero. copy_to_host() waits for the GPU result and returns a new CPU array, which main() prints.",
    native: "Keep both prints. In main(), replace np.zeros(1, dtype=np.float32) with np.array([5], dtype=np.float32). Check which of the two printed arrays changes.",
    cases: [caseOf("one", "One element", fixture({ out: zeros([1]) }, "out", ["out"], {}, [1], [1], [42]))],
  },
  "vector-add": {
    sourceTarget: "if i < n:",
    title: "One thread, one element",
    summary: "Map threads to array indices and skip threads beyond the end of the input.",
    intro: [
      "A block is a group of GPU threads. In main(), the launch starts enough whole blocks to cover the arrays.",
      { label: "Map a thread to an array element", from: "i = cuda.grid(1)", through: "out[i] = a[i] + b[i]" },
      "cuda.grid(1) returns the thread’s global index in a one-dimensional launch. Multiply the block number by the number of threads per block, then add the thread’s number within the block. All indices start at zero. The guard i < n lets only threads with a valid index read and write the arrays.",
    ],
    predict: "In the 33-element case with 32 threads per block, which block and thread write index 32? How many threads in that block skip the write?",
    exercise: [
      "Run 33 elements · 32 threads per block. Find the last value in out. In main(), find the two launch dimensions and calculate how many threads start.",
      "Use the kernel’s index formula to work out which block and thread write index 32. The quotient of 32 divided by the block width is the block number. The remainder is the thread number.",
      "In the same program, change kernel[2, 32] to kernel[3, 16] in main(). Rerun and calculate the new block and thread numbers. Check the last value again.",
    ],
    explain: "Block 1, Thread 0 writes index 32 with 32 threads per block. Block 2, Thread 0 writes the same index with 16 threads per block. Both add 33 and 66 to get 99. The bounds check excludes every thread with i ≥ 33.",
    native: "In the GPU notebook, add if i == n - 1: just below the kernel’s assignment at the same indentation, then indent print(cuda.blockIdx.x, cuda.threadIdx.x) under the condition. Run both block sizes and compare the printed indices with your calculation.",
    cases: [caseOf("partial-32", "33 elements · 32 threads per block", vector(33, 32)), caseOf("partial-16", "33 elements · 16 threads per block", vector(33, 16)), caseOf("exact-32", "32 elements · exact fit", vector(32, 32))],
  },
  "grid-stride": {
    sourceTarget: "cuda.gridDim.x * cuda.blockDim.x",
    title: "Let each thread do more work",
    summary: "Use a loop so each thread can visit more than one array index.",
    intro: [
      "A grid is the collection of blocks in a launch. For a one-dimensional grid and block, cuda.gridDim.x counts blocks and cuda.blockDim.x counts threads per block.",
      { label: "Step by the total thread count", from: "first = cuda.grid(1)",
        through: "out[i] = values[i] * 2" },
      "Each thread starts at its global index, first. The stride is the step between indices visited by that thread. Here it equals the total number of threads. The loop stops before n, the array length, so each thread covers a different set of valid indices.",
    ],
    predict: "With 16 threads total and 35 elements, which indices does Block 0, Thread 3 visit?",
    exercise: [
      "Run 35 elements · 16 threads total. Follow the loop for Block 0, Thread 3 by listing range(3, 35, 16). Check the output values at those indices.",
      "Change kernel[2, 8] to kernel[2, 4] in main() and rerun. List range(3, 35, 8) and check that the resulting array stays the same.",
      "For the eight-thread launch, calculate the indices Thread 3 would visit in each block if the stride were only four. Which index appears in both lists?",
    ],
    explain: "Block 0, Thread 3 visits 3 and 19 with stride 16, or 3, 11, 19, and 27 with stride 8. With stride 4, both inspected threads visit index 7.",
    native: "In the GPU notebook, add if cuda.threadIdx.x == 3: below the kernel loop’s assignment and indent print(cuda.blockIdx.x, i) under the condition. CUDA may print lines from different threads in different orders.",
    cases: [caseOf("stride-16", "35 elements · 16 threads total", stride(35, 8)), caseOf("stride-8", "35 elements · 8 threads total", stride(35, 4)), caseOf("short-7", "7 elements · 16 threads total", stride(7, 8))],
  },
  transfers: {
    sourceTarget: "out[i] = alpha * x[i] + y[i]",
    title: "Count bytes moved between host and GPU",
    summary: "Separate the kernel’s array accesses from the copies that get data to and from a GPU.",
    intro: [
      "In main(), cuda.to_device copies x and y to the GPU.",
      { label: "Allocate, launch, and copy back in the 33-element case", from: "out = cuda.device_array(33, dtype=np.float32)",
        through: "result = out.copy_to_host()" },
      "cuda.device_array reserves space for out on the GPU. After the kernel writes to out, copy_to_host copies its contents to the CPU.",
      { label: "Read and write arrays already on the GPU", from: "if i < n:", through: "out[i] = alpha * x[i] + y[i]" },
      "Each active thread reads one element from each input and writes one value to out. These are global memory accesses because the arrays are in GPU memory available to all threads. The arrays use float32, a format that takes four bytes per element.",
    ],
    predict: "In the 33-element case, how many bytes of array data cross between host and device if x and y start on the host and out returns to the host?",
    exercise: [
      "Run 33 elements. Inside main(), just before return result, add print(x_host.nbytes, y_host.nbytes, result.nbytes). Rerun and add those three byte counts.",
      "Find the allocation of out in main(). In the kernel, count the array reads and writes in the assignment for one active thread. Multiply by 33 and compare the counts with the three host–device copies.",
      "Run the 8 elements case and repeat the byte count. In both cases explain how the test i < n determines how many threads touch the arrays.",
    ],
    explain: "In the 33-element case each copy moves 132 bytes, for 396 bytes total. The kernel performs 66 array reads and 33 writes. For eight elements the three copies total 96 bytes. The GPU allocation for out reserves storage.",
    native: "Run the affine investigation in Appendix A. Compare Kernel (ms) and Round trip (ms) across input sizes, then compare the measured times for one and two streams.",
    cases: [caseOf("affine-33", "33 elements", affine(33)), caseOf("affine-8", "8 elements", affine(8))],
  },
  coalescing: {
    sourceTarget: "out[col, row] = values[row, col]",
    title: "See how threads group memory accesses",
    summary: "Use a matrix transpose to see why neighboring threads can read nearby addresses and write far apart.",
    intro: [
      "A streaming multiprocessor (SM) executes the threads of a block in groups called warps. Each warp has 32 positions called lanes. A partial warp leaves some lanes unused. In a two-dimensional block, lanes are numbered across x before moving to the next y. The kernel uses x for the column and y for the row.",
      { label: "Read one matrix element and swap its coordinates", from: "col, row = cuda.grid(2)",
        through: "out[col, row] = values[row, col]" },
      "cuda.grid(2) gives the thread’s global x and y coordinates. A transpose swaps the row and column of each value. Because the arrays store each row together, adjacent lanes read consecutive columns of values and write to different rows of out.",
      "A sector is an aligned group of 32 bytes. Eight float32 values fit in a sector. Count word offsets in four-byte units from the start of an array. For the address calculations below, assume each array starts on a sector boundary.",
    ],
    predict: "For the first eight lanes in 8 rows × 32 columns, will the reads of values or the writes to out reach more 32-byte sectors?",
    exercise: [
      "Run 8 rows × 32 columns. In main(), add print(result[:8, 0]) just before return result. Compare those outputs with the first eight entries of values_host in main().",
      "For Block (0, 0), work out the read and write word offsets for Threads (0, 0) and (7, 0). For a row-major array, offset = row × number of columns + column. Divide the offsets by eight and round down to find their sectors.",
      "Run 5 rows × 13 columns. For Block (1, 1), the first active row has five reads at word offsets 60–64. Use the same formula to count the sectors they occupy.",
    ],
    explain: "In the 8 × 32 case the first eight lanes read one sector and write eight. Across the 32-lane warp, reads cover four sectors and writes cover 32. In the 5 × 13 edge block, consecutive offsets 60–64 cover two sectors. Hardware traffic also depends on caching and the instructions the GPU runs.",
    native: "In Appendix A, profile the direct and tiled transposes at the same shape. Compare effective bandwidth and inspect global load and store sectors in Nsight Compute.",
    cases: [caseOf("wide", "8 rows × 32 columns", transpose(8, 32, 32, 1)), caseOf("narrow", "5 rows × 13 columns", transpose(5, 13, 8, 4))],
  },
  divergence: {
    sourceTarget: "if x < 0:",
    title: "When threads take different branches",
    summary: "Compare how two arrangements of the same number of negative and positive inputs affect groups of GPU threads.",
    intro: [
      "A branch is a choice between paths, such as the if and else parts of an if statement. Warp divergence occurs when threads in one warp take different paths. A GPU can run a path with only the lanes that chose it active.",
      { label: "Choose a path for each input", from: "x = values[i]", through: "out[i] = x" },
      "Each block in these cases has one warp. The kernel scales negative inputs by 0.25 and leaves positive inputs unchanged, so the output sign tells you which path each thread took.",
    ],
    predict: "Both cases have 64 inputs. Alternating signs switches between negative and positive, starting with a negative value. Grouped signs puts the negative values first, then the positive values, 32 of each. How many lanes in Block 0 take the negative path in each case? How many blocks contain both paths?",
    exercise: [
      "Run Alternating signs. Compare the first two inputs, −1 and 2, with the first two output values. Which input was multiplied by 0.25?",
      "In main(), add print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0)) just before return result. The first count is for Block 0 and the second for Block 1.",
      "Run Grouped signs and repeat the count. In which case does a warp have lanes that take both paths?",
    ],
    explain: "Alternating signs puts 16 lanes on each path in both warps. Grouped signs puts all 32 negative values in Block 0 and all 32 positive values in Block 1. A timing difference on a GPU depends on the compiled instructions and the work on each path.",
    native: "For a controlled timing comparison, use equally sized inputs with the same values reordered. Inspect the compiled instructions before attributing a timing difference to the branch.",
    cases: [
      caseOf("alternating", "Alternating signs", divergence(range(64).map((i) => (i + 1) * (i % 2 ? 1 : -1)))),
      caseOf("grouped", "Grouped signs", divergence(range(64).map((i) => (i + 1) * (i < 32 ? -1 : 1)))),
    ],
  },
  reduction: {
    sourceTarget: "cuda.syncthreads()",
    title: "Add values across a block",
    summary: "Add values in pairs until each block has one partial sum.",
    intro: [
      "A reduction combines many values into fewer results. Here each block adds its portion of the input to make one sum. Each thread writes one input value into scratch. Threads beyond the last input write zero. Scratch is in shared memory, which threads in one block can read and write.",
      { label: "Fill scratch before any thread reads a neighbor", from: "scratch[lane] = values[i] if i < n else 0.0",
        through: "cuda.syncthreads()" },
      "A block barrier, written cuda.syncthreads(), makes every thread in the block wait until all have reached that line. The first barrier lets every thread finish writing its starting value. The block then adds pairs of values, with another barrier between steps. The starter uses a power-of-two block size of at most 32 threads, the size of scratch.",
    ],
    predict: "In the eight-thread block, the first pairs are four positions apart. Which thread adds scratch[5] to its own value? What must be ready before it reads scratch[5]?",
    exercise: [
      "Run 16 values · 8 threads per block. Record the two partial sums. Manually add the first eight input values and compare with out[0].",
      "At distance four, find the two input values Thread 1 in Block 0 combines. Use the first scratch assignment to work out which threads write those values and what the first barrier makes possible.",
      "Run 19 values · partial block with the starter. Only the last three inputs belong to Block 2. Compare their sum with out[2] and explain why out-of-range threads contribute zero.",
    ],
    explain: "Thread 1 reads scratch[5] when it adds the value four slots away. Thread 5 stores that value before the barrier releases Thread 1. In the 19-value case, Block 2 sums 17 + 18 + 19 = 54 because the other five threads contribute zero.",
    native: "In the GPU notebook, print scratch[lane] and scratch[lane + distance] just above the addition for Block 0, Lane 1, at distance four. In Appendix A, use Compute Sanitizer to see how it detects a missing barrier.",
    cases: [caseOf("full-16", "16 values · 8 threads per block", reduction(16, 8)), caseOf("tail-19", "19 values · partial block", reduction(19, 8)), caseOf("wide-39", "39 values · 32 threads", reduction(39, 32))],
  },
  histogram: {
    sourceTarget: "cuda.atomic.add(counts, tokens[i], 1)",
    title: "Count inputs by category",
    summary: "Count how many inputs choose each category when several threads update the same counter.",
    intro: [
      "A histogram counts how many inputs fall into each category. The inputs here are integers called tokens. Each token selects one of four counters in counts. main() copies a fresh array of zeros to the GPU for each run.",
      { label: "Increment the counter selected by this token", from: "cuda.atomic.add(counts, tokens[i], 1)" },
      "cuda.atomic.add reads a counter, adds one, and writes the new value as one update. Each increment is counted even when several threads choose the same counter.",
    ],
    predict: "When all 32 tokens go to destination 2, which counter changes? What count could two threads produce if both read zero before either writes?",
    exercise: [
      "Run Balanced destinations and then All tokens route to 2. Compare counts[2] and the total of all four counts.",
      "Keep All tokens route to 2. Replace cuda.atomic.add(counts, tokens[i], 1) with counts[tokens[i]] += 1. Run the program several times and record the values of counts[2].",
      "Put the atomic operation back and rerun. Explain how two threads could lose an increment with the plain assignment.",
    ],
    explain: "In the balanced case each counter gets eight increments. When all tokens route to 2, that counter gets all 32 with the atomic update. With a plain increment, two threads can read the same value and both write the same incremented value. The count can vary with execution order.",
    native: "For a timing comparison, use equally sized, larger balanced and single-destination inputs. Reset the counters before each launch.",
    cases: [caseOf("balanced", "Balanced destinations", histogram(range(32).map((i) => i % 4))), caseOf("hot", "All tokens route to 2", histogram(Array(32).fill(2)))],
  },
  scan: {
    sourceTarget: "previous = scratch[lane - distance] if lane >= distance else 0\n        cuda.syncthreads()",
    title: "Find positions with running totals",
    summary: "Build running totals and use them to find positions for values you keep.",
    intro: [
      "An inclusive scan at index i adds values[0] through values[i]. If the values are flags (1 means keep, 0 means discard), a kept item’s position is its running total minus one. The kernel writes the running totals to out so you can find those positions.",
      { label: "Read, wait, and update one scan stage", from: "previous = scratch[lane - distance] if lane >= distance else 0",
        through: "distance *= 2" },
      "At each step, a thread looks back a fixed distance and saves the old value from scratch before changing its own entry. One barrier lets the threads finish reading. A second barrier lets them finish writing before the distance doubles.",
    ],
    predict: "For [1, 0, 1, 1, 0, 0, 1], what running total do you expect at index 6? Where would that element move?",
    exercise: [
      "Run Keep flags · 7 elements. Read out[6] and subtract one to find the destination of the final kept element.",
      "Follow the assignment to previous for Lane 6. The loop starts at distance one and doubles it on each pass. List the shared-memory indices read by Thread 6.",
      "Run Weighted counts · 13 elements with the starter and compare the last output with the sum of the inputs. Which parts of the algorithm are the same with flags and weights?",
    ],
    explain: "Thread 6 reads scratch[5], scratch[4], and scratch[2] at distances 1, 2, and 4. The first barrier in each pass lets all threads read the previous stage before the writes begin. In the weighted case, out[12] is 26, the sum of all 13 weights.",
    native: "Extend Check the output in the flags notebook with print(actual[[0, 2, 3, 6]] - 1). Those four flags are one, and their output positions are 0, 1, 2, and 3.",
    cases: [caseOf("flags", "Keep flags · 7 elements", scan([1, 0, 1, 1, 0, 0, 1], 8)), caseOf("weights", "Weighted counts · 13 elements", scan([2, 4, 0, 3, 1, 5, 0, 0, 1, 2, 3, 4, 1], 16))],
  },
  "tiled-transpose": {
    sourceTarget: "PADDING = 1",
    title: "Transpose through a shared tile",
    summary: "Pass values through shared memory so neighboring threads can write neighboring output columns.",
    intro: [
      "A tile is a small rectangular region of a matrix. Each block loads one tile into shared memory. After a barrier, threads read it with the coordinates swapped and write the transposed values.",
      { label: "Set the shared tile’s row width", from: "TILE = 8", through: "TILE_STRIDE = TILE + PADDING" },
      "GPU shared memory is divided into banks that can serve requests independently. In the 32-bank calculation for four-byte values, the bank is the word offset modulo 32. Padding adds an unused word to each row of the tile and changes where the next row starts.",
    ],
    predict: "In Block (0, 0) of the 8 × 8 case, which thread loads the input value that Thread (2, 0) writes to out[0, 2]?",
    exercise: [
      "Run 8 rows × 8 columns. In main(), add print(result[0, 2]) just before return result. Find the matching input in values_host and identify the thread that loaded it.",
      "Find the shared read of tile[tx, ty] for Thread (2, 0). Its word offset is 2 × TILE_STRIDE. Record the offset and bank with PADDING = 1, then set PADDING = 0, rerun, and calculate them again. Compare the output check.",
      "Run 11 rows × 13 columns with the starter. Check the output and locate the last index (12, 10) in the transposed result.",
    ],
    explain: "The shared word offset and bank change from 18 to 16 when you remove the padding. The transposed result stays the same. A bank conflict can delay lanes that request different words from the same bank. Use hardware counters to measure conflicts when comparing larger tiles.",
    native: "Run the transpose investigation in Appendix A. Compare direct, unpadded, and padded kernels for the same shape. Inspect shared-load bank conflicts.",
    cases: [caseOf("square", "8 rows × 8 columns", transpose(8, 8, 8, 8)), caseOf("edges", "11 rows × 13 columns", transpose(11, 13, 8, 8))],
  },
  matmul: {
    sourceTarget: "tile_a[ty, tx] = a[row, a_col] if row < m and a_col < k else 0",
    title: "Reuse inputs in matrix multiplication",
    summary: "Reuse pieces of the two input matrices while computing a matrix product.",
    intro: [
      "To compute out[row, col], take one row of a and one column of b. Multiply entries at the same position and sum the products. The number of products is the inner dimension k, the number of columns in a and rows in b.",
      { label: "Choose which inputs to stage for this pass", from: "a_col = start + tx",
        through: "tile_b[ty, tx] = b[b_row, col] if b_row < k and col < n else 0" },
      "In each pass the block copies one 4 × 4 tile from each input into shared memory, using zero for positions outside the input. A barrier makes both tiles ready. Each thread adds four products to its own total. A second barrier waits for the threads to finish using both tiles before loading the next pair.",
    ],
    predict: "For 5 × 6 times 6 × 7, which inner indices fall outside the input in the second pass?",
    exercise: [
      "Run 5 × 6 times 6 × 7 and check the result. Find the range with step TILE in the kernel and list the inner indices in each pass.",
      "Trace the assignments to tile_a[0, 2] and tile_a[0, 3] for the first block. In the second pass, what values do these two positions get and why?",
      "Run 4 × 4 times 4 × 4. Compare the number of passes and explain how a value loaded into a shared tile can serve more than one output.",
    ],
    explain: "The second tile covers inner indices 4–7, so indices 6 and 7 contribute zero. Each loaded value can serve several output cells through shared reads. Threads outside the output can still load tiles and reach the barriers.",
    native: "Use matching input shapes when comparing timings for different matrix multiplication implementations.",
    cases: [caseOf("rectangular", "5 × 6 times 6 × 7", matmul(5, 6, 7)), caseOf("square", "4 × 4 times 4 × 4", matmul(4, 4, 4))],
  },
  softmax: {
    sourceTarget: "math.exp(values[row, col] - row_max)",
    title: "Build a stable softmax",
    summary: "Turn scores into probabilities without overflowing the exponential.",
    intro: [
      "Softmax converts a row of scores, also called logits, to probabilities that add to one. Use math.exp to raise e to the power of each score. Divide each result by the sum of those results. The exponential of a large score can be too large for the numeric format, which is called overflow.",
      { label: "Write a probability from the shifted score", from: "out[row, col] = math.exp(values[row, col] - row_max) / scratch[0]" },
      "Subtracting the row maximum makes every shifted score zero or negative, so every exponential is at most one. The common shift preserves the probability ratios. One block handles each row and stores the sum of the shifted exponentials in scratch[0]. A thread with no column contributes −∞ to the maximum and zero to the sum.",
    ],
    predict: "Row 0 is [1000, 999, 1000, 997, −1000]. What is the exponential of the largest score after subtracting the row maximum? Which two columns should have equal probabilities?",
    exercise: [
      "Run Extreme and equal logits. Compare the first and third probabilities in row 0. In main(), add print(result.sum(axis=1)) just before return result and check how close both row sums are to 1.",
      "Replace both math.exp(values[row, col] - row_max) calls with math.exp(values[row, col]). In main(), add print(np.isfinite(result).all()) just before return result and rerun. Does the result still contain only finite values?",
      "Run Two rows · 37 columns with the starter. In the final loop, list the columns where Lane 0 writes. How does the number of threads per block set their spacing?",
    ],
    explain: "Removing the shift makes exp(1000) overflow. Dividing an infinite exponential by an infinite total can produce NaN. Columns 0 and 2 get equal probabilities in the stable version because they start at the same score and share the divisor. With 37 columns, Lane 0 visits columns 0 and 32.",
    native: "In Appendix A, run the softmax investigation against torch.softmax on the same float32 buffers. Check the probabilities before comparing CUDA event times.",
    cases: [
      caseOf("extreme", "Extreme and equal logits", softmax([[1000, 999, 1000, 997, -1000], [-1002, -1001, -1000, -1000, -1004]])),
      caseOf("wide-37", "Two rows · 37 columns", softmax([range(37).map((i) => i % 9 - 4), range(37).map((i) => 800 + i % 5)])),
    ],
  },
  gather: {
    sourceTarget: "indices[i]",
    title: "Read values through an index array",
    summary: "Trace a gather, where each output selects an input using a separate index array.",
    intro: [
      { label: "Look up an input through indices", from: "out[i] = values[indices[i]]" },
      "A gather looks up values at positions listed in another array. Thread i reads indices[i], uses it to select a value from values, and writes the answer to out[i]. Each case supplies eight indices and a table of 64 values.",
      "Both cases read indices consecutively. Use an aligned 32-byte sector containing eight four-byte values to group addresses in the values array.",
    ],
    predict: "If the eight indices are [0, 8, 16, 24, 32, 40, 48, 56], how many sectors do reads of indices and reads of values touch?",
    exercise: [
      "Run Consecutive positions and Spaced positions. In each case, find indices_host in main() and match its second index to the value printed at out[1].",
      "For each case, find the sectors touched by the reads from values. Divide each index in indices_host by eight and round down. How many different sector numbers do you get?",
      "Keep Spaced positions. Replace values[indices[i]] with values[i] and rerun. Compare the output and recalculate the sectors for the direct indices 0–7.",
    ],
    explain: "Consecutive positions touch one sector in each input array. Spaced positions still touch one sector in indices and touch eight in values. The direct edit changes which inputs the kernel reads, so the result changes.",
    native: "Profile larger gathers with matching input sizes to see how the address pattern affects GPU traffic. Compare the memory counters with your sector predictions.",
    cases: [caseOf("consecutive", "Consecutive positions", gather(range(8))), caseOf("spaced", "Spaced positions", gather(range(8).map((i) => i * 8)))],
  },
  stencil: {
    sourceTarget: "tile[0] = values[i - 1] if i > 0 else 0.0",
    title: "Share neighboring values across threads",
    summary: "Sum each element and its neighbors while reusing inputs in shared memory.",
    intro: [
      "A stencil applies the same rule at each position using nearby inputs. Here the rule adds the left neighbor, the current value, and the right neighbor. The kernel uses zero for neighbors outside the array.",
      { label: "Load the center values and the halo", from: "tile[lane + 1] = values[i] if i < n else 0.0",
        through: "tile[WIDTH + 1] = values[i + 1] if i + 1 < n else 0.0" },
      "The shared version uses eight threads per block. Each thread loads one center value into a tile. The first and last threads load the two extra neighboring values, called the halo. A barrier makes those values available to the whole block before it writes outputs.",
    ],
    predict: "At the first position of Block 1, which input from Block 0 must the stencil include? Which shared entry holds it?",
    exercise: [
      "Run 16 values · direct reads and 16 values · shared tile. Compare their output arrays. In the direct version, count the array accesses for the two endpoints and for the other fourteen elements.",
      "In the shared version, find the loads of tile[lane + 1], tile[0], and tile[WIDTH + 1]. Count the center values and the valid halo values for the two blocks. Which load supplies the left neighbor of out[8]?",
      "In the shared case, replace tile[0] = values[i - 1] if i > 0 else 0.0 with tile[0] = 0.0. Rerun the program and compare out[8] with the original. Run 13 values · partial tile with the starter to check the edge handling.",
    ],
    explain: "The direct source reads input elements 46 times. Shared staging uses 18 reads, including the two across the block boundary. Block 1 loads input index 7 into tile[0]. Removing that halo changes out[8] from 27 to 19. Repeated reads can hit the hardware cache.",
    native: "Use equally sized, larger input arrays to time the two methods. Compare the cost of the extra reads with the cost of shared-memory staging and its barrier.",
    cases: [caseOf("direct", "16 values · direct reads", stencil(16, 0)), caseOf("shared", "16 values · shared tile", stencil(16, 1)),
      caseOf("tail", "13 values · partial tile", stencil(13, 1))],
  },
  precision: {
    sourceTarget: "float32(a[i] + b[i])",
    title: "See how rounding changes a sum",
    summary: "Group the same three values in two orders and check their float32 results.",
    intro: [
      "Float32 stores numbers with limited precision. Around 16,777,216, the next larger float32 value is 16,777,218. Adding 1 to 16,777,216 and rounding to float32 gives 16,777,216 again.",
      { label: "Round after each addition", from: "first = float32(a[i] + b[i])", through: "out[i] = float32(first + c[i])" },
      "The explicit float32 calls make the intended rounding points visible. Changing the grouping changes when addition can lose a small value.",
    ],
    predict: "For a = 16,777,216, b = 1, and c = −16,777,216, what happens to the 1 when you add a and b first? What if you add a and c first?",
    exercise: [
      "Run Near the precision limit. Thread 0 starts with 16,777,216 and Thread 1 starts with 8,388,608. Both add 1 and then subtract their starting value. Compare the two outputs.",
      "In the kernel, change a[i] + b[i] to a[i] + c[i] and first + c[i] to first + b[i]. Rerun and explain why only one result changes.",
      "Run Smaller integers with the starter. Check whether the original grouping preserves 1 for both values.",
    ],
    explain: "The first case starts with a values of 16,777,216 and 8,388,608. The original order returns 0 for the first thread and 1 for the second. Canceling a and c before adding b gives 1 for both. The starter reference follows the original float32 grouping. The exact sum is 1 for both inputs, so the edited result at index 0 is closer to the exact sum.",
    native: "In a new notebook cell, compare np.float64(16777216) + 1 - 16777216 with the first float32 output. The extra precision lets the CPU calculation retain 1.",
    cases: [caseOf("near", "Near the precision limit", precision([2 ** 24, 2 ** 23])), caseOf("small", "Smaller integers", precision([100, 1000]))],
  },
  "sync-debug": {
    sourceTarget: "slot[lane] = i if i < n else -1",
    title: "Keep edge threads at the barrier",
    summary: "Compare a full and partial block to see why every thread reaches the barrier.",
    intro: [
      "Each block has four threads. A thread stores its global index in shared memory, or −1 if its index is outside the output. After a block barrier, each active thread copies the next entry. The last thread in a block reads the first entry.",
      { label: "Reach the barrier before checking the output bound", from: "slot[lane] = i if i < n else -1",
        through: "out[i] = slot[(lane + 1) % 4]" },
      "Every thread in a block must participate in the barrier in this program. In the partial-block case, one thread in Block 1 has an index outside the output but supplies a value to another thread.",
    ],
    predict: "In the 7-output case, which thread in Block 1 supplies the −1? What happens to the barrier if that thread returns first?",
    exercise: [
      "Run 8 outputs · two full blocks and then 7 outputs · partial block. Compare out[6] and identify which thread supplied it in each case.",
      "Keep the partial block and change the fallback in slot[lane] = i if i < n else -1 from -1 to -9. Rerun and find every output that changed.",
      "Work out what would happen if threads with i >= n returned before the shared-memory assignment. Which shared value would be missing? Which thread would skip the barrier?",
    ],
    explain: "In the seven-output case, Thread 3 in Block 1 supplies the fallback for Thread 2. Returning early also skips cuda.syncthreads(), violating the block’s synchronization rule. The eight-output case has no out-of-range thread to expose that bug.",
    native: "Use the synchronization investigation in Appendix A to run the faulty version under Compute Sanitizer and interpret the report.",
    cases: [caseOf("partial", "7 outputs · partial block", syncDebug(7)), caseOf("full", "8 outputs · two full blocks", syncDebug(8))],
  },
  fusion: {
    sourceTarget: "if use_temp:",
    title: "Remove an intermediate array",
    summary: "Keep a value inside a thread instead of writing it out and reading it back.",
    intro: [
      "The first operation scales x and adds y. The second replaces negative results with zero. Putting both operations in one kernel is called fusion. A thread can keep an intermediate value locally and avoid reading or writing a temporary array.",
      { label: "Use the local value or take the temporary-array path", from: "value = float32(alpha * x[i] + y[i])",
        through: "out[i] = max(value, float32(0))" },
      "These two cases each launch one kernel. One case stores temp and reads it back. The other keeps the value in a local variable. The profiling capstone compares separate launches with a fused launch.",
    ],
    predict: "For eight inputs, how many global reads and writes can you remove if each thread skips its write to temp and its read from temp?",
    exercise: [
      "Run 8 values · store temporary. Record the output. Count the input reads, temporary reads, temporary writes, and output writes performed by one active thread.",
      "Run 8 values · keep local. Compare the output and identify the two temporary-array operations that disappear. Multiply the per-thread counts by eight for each case.",
      "In the store-temporary program, change if use_temp: to if False: and rerun. Compare the result with the keep-local case.",
    ],
    explain: "For eight elements, the temporary adds eight reads and eight writes. The local version reads x and y and writes only out, for 16 reads and eight writes. Both versions produce the same values. The access counts are a source-level prediction for the hardware capstone, since memory traffic also depends on what the compiler and caches do.",
    native: "In Appendix A, run the capstone. Compare two launches with a fused launch across input sizes and block sizes. Check whether the measured times support your access-count prediction.",
    cases: [caseOf("temporary", "8 values · store temporary", fusion(8, 1)), caseOf("local", "8 values · keep local", fusion(8, 0)),
      caseOf("tail", "13 values · keep local", fusion(13, 0))],
  },
};
