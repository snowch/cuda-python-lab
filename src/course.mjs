const range = (length) => Array.from({ length }, (_, i) => i);
const ceil = (n, width) => Math.ceil(n / width);
const buffer = (values, shape = [values.length], dtype = "float32") => ({ values, shape, dtype });
const zeros = (shape, dtype) => buffer(Array(shape.reduce((a, b) => a * b, 1)).fill(0), shape, dtype);
const fixture = (buffers, output, args, scalars, blocks, threads, expected) => ({
  buffers, output, args, scalars, blocks, threads, expected,
});
const caseOf = (label, data) => ({ label, ...data });
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
  return fixture({ x: buffer(x), y: buffer(y), out: zeros([size]) }, "out",
    ["x", "y", "out", "n", "alpha"], { n: size, alpha }, [ceil(size, 32)], [32],
    x.map((v, i) => alpha * v + y[i]));
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
  return { ...fixture({ tokens: buffer(tokens, [n], "int32"), counts: zeros([4], "int32") }, "counts",
    ["tokens", "counts", "n"], { n }, [ceil(n, 16)], [16],
    range(4).map((i) => tokens.filter((token) => token === i).length)), resetOutput: true };
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

export const modules = [
  {
    title: "CUDA foundations",
    description: "Launch your first kernel and work out how its threads cover an array.",
    lessons: ["first-value", "vector-add", "grid-stride"],
  },
  {
    title: "Memory and execution",
    description: "Count data transfers and see how groups of threads access memory and take branches.",
    lessons: ["transfers", "coalescing", "divergence"],
  },
  {
    title: "Parallel patterns",
    description: "Add values, count destinations, and compute running totals with cooperating threads.",
    lessons: ["reduction", "histogram", "scan"],
  },
  {
    title: "Optimization and ML",
    description: "Reuse data in shared memory and combine reductions in a numerically stable softmax.",
    lessons: ["tiled-transpose", "matmul", "softmax"],
  },
];

export const lessons = {
  "first-value": {
    sourceTarget: "42",
    title: "Write your first GPU value",
    summary: "Write a number from one GPU thread and inspect the output.",
    intro: [
      "A kernel is a function that the host (the CPU-side program) launches on the device (the GPU). The launch groups threads into blocks. Each thread runs the same kernel code. This case launches one block with one thread.",
      "In a GPU notebook, the host allocates the output array, launches the kernel, then copies the result back to the host.",
    ],
    predict: "If you replace 42 with 73, what will the only thread write to out[0]?",
    exercise: [
      "Click Run kernel with the starter code. Record the value of out in the Console.",
      "In first-value.py, replace 42 with 73 and click Run kernel again.",
      "Read out in the Console again. Open Compare with starter and find Last traced writer at index 0.",
      "Which value changed, and which thread wrote it? In Editor tools, select Restore starter.",
    ],
    explain: "The value in out changes from 42 to 73. Block 0, Thread 0 still writes out[0]. The starter reference remains 42 because it is the expected output of the original code.",
    native: "Run the starter notebook and find the device allocation, kernel launch, and copy back to the host. In Check the output, insert case[\"threads\"] = [2] just after case = json.loads(…) and rerun the cell. The same result can hide two threads writing to one address without coordination.",
    evidence: ["trace"],
    reference: 'np.array([42], dtype=np.float32)',
    cases: [caseOf("One element", fixture({ out: zeros([1]) }, "out", ["out"], {}, [1], [1], [42]))],
  },
  "vector-add": {
    sourceTarget: "if i < n:",
    title: "One thread, one element",
    summary: "Map threads to array indices and skip threads beyond the end of the input.",
    intro: [
      "In a one-dimensional launch, cuda.grid(1) returns the global index: block index × threads per block + thread index within the block. All indices start at zero.",
      "The prepared cases round up the block count so every element has a thread. The condition i < n is a bounds check: threads whose index reaches the array length skip the reads and write.",
    ],
    predict: "In the 33-element case with 32 threads per block, which block and thread write index 32? How many threads in that block skip the write?",
    exercise: [
      "Select 33 elements · 32 threads per block in Case and click Run kernel. In the Console, open Compare with starter and find Last traced writer at index 32.",
      "In Thread inspector, select Block 1. Select Thread 0 and Thread 1 in turn and compare their event counts. Which thread wrote index 32?",
      "Switch to 33 elements · 16 threads per block, run again, and find the writer at index 32.",
      "In vector-add.py, replace if i < n: with if True:, run again, and find the first out-of-range index in the error. In Editor tools, select Restore starter.",
    ],
    explain: "Block 1, Thread 0 writes index 32 with 32 threads per block. Block 2, Thread 0 writes the same index with 16 threads per block. The other 31 threads in Block 1 of the 32-thread case skip the write. Without the bounds check, the first invalid read is at index 33.",
    native: "Export and run the starter notebook for each 33-element case and for the 32-element case. Check the complete output against a + b. Compare block and thread counts for the two 33-element cases.",
    evidence: ["trace"],
    reference: "host['a'] + host['b']",
    cases: [caseOf("33 elements · 32 threads per block", vector(33, 32)), caseOf("33 elements · 16 threads per block", vector(33, 16)), caseOf("32 elements · exact fit", vector(32, 32))],
  },
  "grid-stride": {
    sourceTarget: "cuda.gridDim.x * cuda.blockDim.x",
    title: "Let each thread do more work",
    summary: "Use a loop so each thread can visit more than one array index.",
    intro: [
      "A grid is the collection of blocks in a launch. In this grid-stride loop, each thread starts at its global index and advances by the total number of threads. The loop stops before n.",
      "Threads with neighboring global indices visit neighboring elements on each pass. You can change the number of launched threads and still cover the array if you update the stride to match the launch.",
    ],
    predict: "With 16 threads total and 35 elements, which indices does Block 0, Thread 3 visit?",
    exercise: [
      "Select 35 elements · 16 threads total, run, and find the write indices for Block 0, Thread 3 in Selected thread trace.",
      "Switch to 35 elements · 8 threads total and repeat.",
      "In grid-stride.py, replace cuda.gridDim.x * cuda.blockDim.x with cuda.blockDim.x and run again. Look for an index written by both Block 0, Thread 3 and Block 1, Thread 3.",
      "Read the Console status to see whether the edited output matches the starter reference. In Editor tools, select Restore starter.",
    ],
    explain: "Thread 3 visits 3 and 19 with stride 16, or 3, 11, 19, and 27 with stride 8. With stride 4, both inspected threads write index 7. The duplicate writes store the same value, so the output comparison cannot detect them.",
    native: "For a larger input, update values, out, their shapes, and n together in the notebook case. Vary the block count while keeping threads per block fixed. Verify each result, then compare Median kernel time to see how launch size affects this workload.",
    evidence: ["trace"],
    reference: "host['values'] * 2",
    cases: [caseOf("35 elements · 16 threads total", stride(35, 8)), caseOf("35 elements · 8 threads total", stride(35, 4)), caseOf("7 elements · 16 threads total", stride(7, 8))],
  },
  transfers: {
    sourceTarget: "out[i] = alpha * x[i] + y[i]",
    title: "Count bytes moved between host and GPU",
    summary: "Separate the kernel’s array accesses from the copies that get data to and from a GPU.",
    intro: [
      "The kernel computes out = alpha × x + y. Each thread that handles an element reads one value from x and one from y, then writes one value to out. Each float32 value occupies four bytes.",
      "On hardware, the host uploads x and y and downloads out. The browser prepares all three arrays locally. Its trace counts the kernel’s reads and writes.",
    ],
    predict: "For 33 elements, how many bytes do the two input uploads and the output download carry in total?",
    exercise: [
      "Select 33 elements and click Run kernel. In the Console, find Global reads and Global writes.",
      "In Thread inspector, select Block 1, Thread 1. Check the event count. What is the thread’s global index, and how does it compare with n?",
      "Repeat with 8 elements and calculate the input and output payload in bytes for each case.",
    ],
    explain: "Block 1, Thread 1 has index 33, so the bounds check skips it. The run has 66 global reads and 33 global writes. Each copied array holds 132 bytes, for 396 payload bytes across three copies. For eight elements the three copies total 96 bytes.",
    native: "In Appendix A, run the affine investigation. Compare device-resident kernel time with synchronous round-trip time at each input size. Compare the one-stream and two-stream columns to test whether overlapping copies and computation helps on your GPU.",
    evidence: ["trace"],
    reference: "np.float32(scalars['alpha']) * host['x'] + host['y']",
    cases: [caseOf("33 elements", affine(33)), caseOf("8 elements", affine(8))],
  },
  coalescing: {
    sourceTarget: "out[col, row] = values[row, col]",
    title: "Follow a warp’s addresses",
    summary: "Use a transpose to see how neighboring threads can read nearby addresses and write far apart.",
    intro: [
      "A warp is a group of up to 32 threads in a block. A lane is a thread’s position in its warp. In a two-dimensional block, the x coordinate varies fastest in lane order.",
      "A row-major array stores each row consecutively. In the transpose, lanes read consecutive columns of values[row, col] but write consecutive rows of out[col, row]. The address model groups memory into 32-byte sectors, each holding eight float32 values. Neighboring lanes can share a sector when their addresses fall within it.",
    ],
    predict: "For the first eight lanes in the 8 rows × 32 columns case, how many 32-byte sectors do their reads and writes touch?",
    exercise: [
      "Select 8 rows × 32 columns and run.",
      "In Block (0, 0), select Thread (0, 0) and then Thread (7, 0).",
      "In Selected thread trace, compare Word offset for each read and write.",
      "In Warp address model, compare Accesses and Distinct sectors for reads of values and writes to out across the whole warp.",
      "Switch to 5 rows × 13 columns, run, and select Block (1, 1). In Warp address model, compare Accesses and Distinct sectors again. Do five consecutive reads fit in one sector when they cross a sector boundary?",
    ],
    explain: "In the 8 × 32 case, the first eight reads have offsets 0–7 and share one sector. The first eight writes have offsets 0, 8, …, 56 and touch eight sectors. Across all 32 lanes, reads touch four sectors and writes touch 32. In the rectangular edge block, only five lanes access the array. They read offsets 60–64 across two sectors and write across four. The address model assumes sector-aligned array starts. Hardware transactions also depend on the GPU and generated instructions.",
    native: "In Appendix A, profile the direct and tiled transposes at the same shape. Compare effective bandwidth and use Nsight Compute to inspect global load and store sectors.",
    evidence: ["trace", "warp"],
    reference: "host['values'].T",
    cases: [caseOf("8 rows × 32 columns", transpose(8, 32, 32, 1)), caseOf("5 rows × 13 columns", transpose(5, 13, 8, 4))],
  },
  divergence: {
    sourceTarget: "if x < 0:",
    title: "When lanes take different branches",
    summary: "Compare two ways of arranging the same number of negative and positive values across warps.",
    intro: [
      "Warp divergence occurs when lanes in one warp take different paths through a branch. A GPU can run one path with only the lanes for that path active. A compiler may instead use a per-lane condition to control whether a short instruction takes effect.",
      "This kernel multiplies negative inputs by 0.25 and copies positive inputs. Each block in these two cases holds one 32-lane warp. The browser shows the inputs and outputs for each lane.",
    ],
    predict: "How many lanes in Block 0 take the negative path in each case? How many blocks contain both paths?",
    exercise: [
      "Run Alternating signs. In the Console, compare the first two entries of out.",
      "Use Input values and launch arguments to count negative values in the first 32 entries and in the last 32.",
      "Switch to Grouped signs, run again, and repeat the counts. Which arrangement puts both paths in a warp?",
    ],
    explain: "Alternating signs puts 16 lanes on each path in both warps. Grouped signs puts all 32 negative values in Block 0 and all 32 positive values in Block 1. A timing difference on a GPU depends on the compiled instructions and the work on each path.",
    native: "Run both cases in GPU notebooks and verify the outputs. For a controlled timing comparison, use inputs of the same size with the same values reordered. Inspect the generated code before attributing a timing difference to the branch.",
    evidence: ["input"],
    reference: "np.where(host['values'] < 0, host['values'] * np.float32(0.25), host['values'])",
    cases: [
      caseOf("Alternating signs", divergence(range(64).map((i) => (i + 1) * (i % 2 ? 1 : -1)))),
      caseOf("Grouped signs", divergence(range(64).map((i) => (i + 1) * (i < 32 ? -1 : 1)))),
    ],
  },
  reduction: {
    sourceTarget: "cuda.syncthreads()",
    title: "Add values across a block",
    summary: "Add values in pairs until each block has one partial sum.",
    intro: [
      "A reduction combines many values into fewer results. Here, each thread writes an input value or a zero into scratch, an array in shared memory that threads in the block can access.",
      "A block barrier makes each thread wait for the rest of its block. The first barrier completes initialization. Another barrier separates each stage of pairwise additions. The starter uses power-of-two block sizes up to 32 threads, the capacity of scratch.",
    ],
    predict: "With eight threads per block, which thread first reads scratch[5], and what must happen before that read?",
    exercise: [
      "Select 16 values · 8 threads per block and run.",
      "In Block 0, select Thread 1 and find the read of scratch[5] in Selected thread trace.",
      "In reduction.py, delete the cuda.syncthreads() immediately after the first scratch[lane] assignment and run again. Read the error. In Editor tools, select Restore starter, then run 19 values · partial block.",
      "In Block 2, inspect Thread 3’s first write to scratch. Why does it write zero?",
    ],
    explain: "Thread 1 reads scratch[5] at distance 4. Without the first barrier the browser can read scratch[4] before Thread 4 initializes it. The model uses one fixed thread order, so a successful run cannot establish that the code is safe under all GPU schedules. In the last block, Thread 3 has global index 19 and supplies a zero.",
    native: "In a starter notebook, compare the sum of the GPU’s block totals with the sum of the NumPy input. The GPU output contains one partial sum per block; the host sum combines them.",
    evidence: ["trace"],
    reference: "np.array([host['values'][i:i+threads[0]].sum() for i in range(0, scalars['n'], threads[0])])",
    cases: [caseOf("16 values · 8 threads per block", reduction(16, 8)), caseOf("19 values · partial block", reduction(19, 8)), caseOf("39 values · 32 threads", reduction(39, 32))],
  },
  histogram: {
    sourceTarget: "cuda.atomic.add(counts, tokens[i], 1)",
    title: "Count token destinations safely",
    summary: "Count how many tokens go to each destination, even when threads update the same counter.",
    intro: [
      "A histogram counts how many inputs fall into each category. Here each integer token selects one of four destination counters. The browser sets all counters to zero before each run.",
      "An atomic addition makes the read, increment, and write indivisible for a counter. Without it, two threads can read the same old count and both store the same incremented count. The browser processes these updates in a fixed order within a phase.",
    ],
    predict: "When all 32 tokens go to destination 2, which counter changes? What count could two threads produce if both read zero before either writes?",
    exercise: [
      "Run Balanced destinations and record counts from the Console. Then run All tokens route to 2 and compare the four counts.",
      "In the all-to-2 case, inspect Threads 0 and 1 of Block 0 and find their atomic updates to counts[2].",
      "In histogram.py, replace cuda.atomic.add(counts, tokens[i], 1) with counts[tokens[i]] += 1 and run again.",
      "Compare Action in Selected thread trace and counts in the Console. In Editor tools, select Restore starter.",
    ],
    explain: "In the balanced case each counter gets eight increments. When all tokens route to 2, that counter gets all 32. The plain increment records a read and a write in place of each atomic update. The browser still counts 32 because it runs the increments in order. On a GPU, the interleaving below can lose an increment.",
    native: "Run both starter cases on a GPU. Compare the result with NumPy’s bincount. To study contention (threads competing to update the same address), use larger balanced and single-destination inputs of equal size and reset the counters before every launch.",
    evidence: ["trace"],
    reference: "np.bincount(host['tokens'], minlength=4)",
    cases: [caseOf("Balanced destinations", histogram(range(32).map((i) => i % 4))), caseOf("All tokens route to 2", histogram(Array(32).fill(2)))],
  },
  scan: {
    sourceTarget: "previous = scratch[lane - distance] if lane >= distance else 0\n        cuda.syncthreads()",
    title: "Build positions from prefix sums",
    summary: "Build running totals and use them to find positions for values you keep.",
    intro: [
      "An inclusive scan at index i sums values[0] through values[i]. With 1 for keep and 0 for discard, a kept element’s new zero-based position is its running total minus one. The kernel outputs the running totals; work out the positions from them.",
      "At each distance, a thread with a predecessor that far to its left saves the old value before updating its own entry in scratch. One barrier finishes the reads. A second finishes the writes before the next distance.",
    ],
    predict: "For [1, 0, 1, 1, 0, 0, 1], what running total do you expect at index 6? Where would that element move?",
    exercise: [
      "Run Keep flags · 7 elements.",
      "Read the seventh entry of out in the Console. Use Selected thread trace for Thread 6 to identify the predecessor indices read at distances 1, 2, and 4.",
      "In scan.py, remove only the cuda.syncthreads() immediately after the previous = line.",
      "Run again and open Compare with starter. Find the first index where Actual and Starter reference differ.",
      "In Editor tools, select Restore starter and run Weighted counts · 13 elements.",
      "Explain what the last value of out in the Console represents when the inputs are weights.",
    ],
    explain: "Thread 6 reads scratch[5], scratch[4], and scratch[2] at distances 1, 2, and 4. Without the read barrier, threads can read a value from the current stage instead of the previous one. In the weighted case, out[12] is 26, the sum of all 13 weights.",
    native: "In the starter notebook for the keep flags, use actual[host['values'] != 0] - 1 to calculate the destination positions. Scatter the kept indices into those positions on the host and compare with np.flatnonzero(host['values']). The kernel handles one block.",
    evidence: ["trace"],
    reference: "np.cumsum(host['values'], dtype=np.int32)",
    cases: [caseOf("Keep flags · 7 elements", scan([1, 0, 1, 1, 0, 0, 1], 8)), caseOf("Weighted counts · 13 elements", scan([2, 4, 0, 3, 1, 5, 0, 0, 1, 2, 3, 4, 1], 16))],
  },
  "tiled-transpose": {
    sourceTarget: "PADDING = 1",
    title: "Transpose through a shared tile",
    summary: "Pass values through shared memory so neighboring threads can write neighboring output columns.",
    intro: [
      "A tile is a small rectangular region of a matrix. Each block loads one tile into shared memory and waits at a barrier. Threads then read the tile with the coordinates swapped and write the transposed values.",
      "GPU shared memory is divided into banks. This lab uses a simple mapping of 32 banks with four bytes per word: bank = Word offset % 32. Padding adds an unused word to each row, changing the offsets of later rows.",
    ],
    predict: "In Block (0, 0) of the 8 × 8 case, which thread loads the input value that Thread (2, 0) writes to out[0, 2]?",
    exercise: [
      "Run 8 rows × 8 columns.",
      "In Block (0, 0), compare Thread (0, 2)’s shared write with Thread (2, 0)’s shared read.",
      "In tiled-transpose.py, set PADDING = 0 and run again.",
      "Compare Index, Word offset, and Shared bank for Thread (2, 0)’s shared read, then check the Console status to see whether the outputs still match the starter reference.",
      "In Editor tools, select Restore starter and run 11 rows × 13 columns. Check the Console status. Open Compare with starter and find the last valid output at index (12, 10).",
    ],
    explain: "The shared word offset and modeled bank change from 18 to 16 when you remove padding. One address shows how padding changes the mapping. A hardware run can measure whether it reduces bank conflicts for a larger tile.",
    native: "In Appendix A, run the transpose investigation. Compare the direct, unpadded, and padded kernels at the same shape. Inspect the shared-load bank conflicts before attributing a bandwidth difference to padding.",
    evidence: ["trace"],
    reference: "host['values'].T",
    cases: [caseOf("8 rows × 8 columns", transpose(8, 8, 8, 8)), caseOf("11 rows × 13 columns", transpose(11, 13, 8, 8))],
  },
  matmul: {
    sourceTarget: "tile_a[ty, tx] = a[row, a_col] if row < m and a_col < k else 0",
    title: "Reuse inputs in matrix multiplication",
    summary: "Reuse pieces of the two input matrices while computing a matrix product.",
    intro: [
      "To compute out[row, col], take the indicated row of a and column of b. Multiply each pair of entries at the same position and sum the products. The number of products is the inner dimension k, the number of columns in a and rows in b.",
      "In each pass the block loads one 4 × 4 tile from each input, using zero for positions outside the input. A barrier makes the tiles ready to read. Every thread then adds four products to its own total. A second barrier keeps the next pass from replacing the tiles too soon.",
    ],
    predict: "For 5 × 6 times 6 × 7, which inner indices fall outside the input in the second pass?",
    exercise: [
      "Run 5 × 6 times 6 × 7.",
      "In Block (0, 0), select Thread (0, 0). Find both writes to the shared array allocated for tile_a, then find reads from both shared arrays after each loading barrier. In the Console, use Global reads and Shared reads to explain how values are reused.",
      "In Block (1, 1), select Thread (3, 3) and find its zero tile writes and barrier arrivals. Does it write to out?",
    ],
    explain: "The second tile covers inner indices 4–7, so indices 6 and 7 contribute zero. Each loaded value can serve several output cells through shared reads. Thread (3, 3) in Block (1, 1) has no output cell, but it still participates in tile loading and reaches the barriers.",
    native: "Run the starter notebook and compare with NumPy’s matrix product. To investigate performance, compare a direct kernel that reads both inputs for each product with the tiled kernel. Use the same larger input shapes, check both outputs, and compare Median kernel time.",
    evidence: ["trace"],
    reference: "host['a'] @ host['b']",
    cases: [caseOf("5 × 6 times 6 × 7", matmul(5, 6, 7)), caseOf("4 × 4 times 4 × 4", matmul(4, 4, 4))],
  },
  softmax: {
    sourceTarget: "math.exp(values[row, col] - row_max)",
    title: "Build a stable softmax",
    summary: "Turn scores into probabilities without overflowing the exponential.",
    intro: [
      "Softmax converts a row of scores, called logits, to probabilities whose sum is one. It divides each exponential by the sum of the row’s exponentials. Subtracting the row maximum before exponentiation preserves these ratios and makes the largest exponential one.",
      "One block handles each row. A thread with no column contributes −∞ when finding the maximum and zero when adding the shifted exponentials.",
    ],
    predict: "Row 0 starts [1000, 999, 1000, 997, −1000]. What is exp(1000 − max)? Which two columns should have equal probabilities?",
    exercise: [
      "Run Extreme and equal logits. In the Console, compare the first and third values in row 0 of out and check Row sums.",
      "In Block 0, inspect Thread 0’s reads of scratch[0] for the maximum and the sum.",
      "In softmax.py, replace both math.exp(values[row, col] - row_max) calls with math.exp(values[row, col]).",
      "Run again and read the error. In Editor tools, select Restore starter.",
      "Run Two rows · 37 columns and inspect Thread 0’s writes to columns 0 and 32.",
    ],
    explain: "Removing the shift makes exp(1000) overflow in the browser. Columns 0 and 2 get equal probabilities because they start at the same score and use the same divisor. Even with the shift, a very small probability can round to zero when converted to float32.",
    native: "In Appendix A, run the softmax investigation. Compare your kernel with torch.softmax on the same float32 input buffers. Check the probabilities before comparing CUDA event times across row widths.",
    evidence: ["trace"],
    reference: "(lambda exps: exps / exps.sum(axis=1, keepdims=True))(np.exp(host['values'] - host['values'].max(axis=1, keepdims=True)))",
    cases: [
      caseOf("Extreme and equal logits", softmax([[1000, 999, 1000, 997, -1000], [-1002, -1001, -1000, -1000, -1004]])),
      caseOf("Two rows · 37 columns", softmax([range(37).map((i) => i % 9 - 4), range(37).map((i) => 800 + i % 5)])),
    ],
  },
};
