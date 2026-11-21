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
    summary: "Change one number in a GPU function and see what it writes.",
    intro: [
      "A GPU (graphics processing unit) can run the same function many times in parallel. A function written to run on the GPU is called a kernel. Each run of that function does the work of one GPU thread.",
      "Numba CUDA lets you write GPU functions in Python. The line @cuda.jit marks this function as a GPU kernel. This exercise uses one GPU thread. The starter reference is the expected result for the original code.",
    ],
    predict: "Each run starts with out = [0]. The starter code assigns 42 to out[0]. If you change 42 to 73, what will the Console show for out?",
    exercise: [
      "Click Run kernel with the starter code. Under Kernel result in the Console, find out = [42].",
      "In the Python editor, replace 42 with 73 in out[0] = 42. Click Run kernel again and check the new value of out in the Console.",
    ],
    explain: "The thread writes the number in the assignment to out[0]. After the edit it writes 73, so the Console reports a difference from the original expected value of 42.",
    native: "After running the browser experiment, download the notebook and run it on an NVIDIA GPU. In Check the output, find cuda.to_device, which creates and copies the array to the GPU, and copy_to_host, which brings the result back to Python. Check the printed value of out.",
    evidence: [],
    reference: 'np.array([42], dtype=np.float32)',
    cases: [caseOf("One element", fixture({ out: zeros([1]) }, "out", ["out"], {}, [1], [1], [42]))],
  },
  "vector-add": {
    sourceTarget: "if i < n:",
    title: "One thread, one element",
    summary: "Map threads to array indices and skip threads beyond the end of the input.",
    intro: [
      "A launch starts a group of GPU threads. CUDA organizes the threads into groups called blocks. Each thread has a number within its block. Here one number identifies each block and each thread within it. cuda.grid(1) returns the thread’s global index, its unique number across all blocks. Multiply the block number by the number of threads per block, then add the thread’s number within the block. Block numbers, thread numbers, and array indices start at zero.",
      "The browser starts enough whole blocks to cover the array. In vector-add.py, i is the number returned by cuda.grid(1) and n is the array length. The test i < n skips any thread whose index is outside the array. Each read or write that the browser records is an event in the thread trace.",
    ],
    predict: "In the 33-element case with 32 threads per block, which block and thread write index 32? How many threads in that block skip the write?",
    exercise: [
      "In Case, select 33 elements · 32 threads per block and click Run kernel. In the Console, open Compare with starter. Find index 32 and record the block and thread shown under Last traced writer.",
      "In Thread inspector, select Block 1. Select Thread 0 and Thread 1 in turn. Compare their recorded event counts and find the write to out at index 32 in Selected thread trace.",
      "Switch Case to 33 elements · 16 threads per block and run again. Compare Last traced writer at index 32 with the block and thread from step 1. Why is the block number different?",
      "In vector-add.py, replace if i < n: with if True: and run again. Find the first out-of-range index in the Console error. In Editor tools, select Restore starter.",
    ],
    explain: "Block 1, Thread 0 writes index 32 with 32 threads per block. Block 2, Thread 0 writes the same index with 16 threads per block. Without the bounds check, the first invalid read is at index 33.",
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
      "A grid is the collection of blocks in a launch. In grid-stride.py, cuda.gridDim.x is the number of blocks and cuda.blockDim.x is the number of threads per block.",
      "Each thread starts at its global index. The stride is the step between indices visited by the same thread. Using the total thread count as the stride lets each thread cover a different set of indices below n, the array length.",
    ],
    predict: "With 16 threads total and 35 elements, which indices does Block 0, Thread 3 visit?",
    exercise: [
      "Select 35 elements · 16 threads total in Case and click Run kernel. In Thread inspector select Block 0, Thread 3. Record the Index values of its writes to out in Selected thread trace.",
      "Switch to 35 elements · 8 threads total and run again. Select Thread 3 in Block 0 and record the write indices. How did the spacing change?",
      "Keep the eight-thread case. In grid-stride.py, replace cuda.gridDim.x * cuda.blockDim.x with cuda.blockDim.x and run again. Compare the write indices for Thread 3 in Blocks 0 and 1. Which index did both threads write?",
      "Read the Console message. Does the output still match the starter reference even with duplicate writes? In Editor tools, select Restore starter.",
    ],
    explain: "Thread 3 visits 3 and 19 with stride 16, or 3, 11, 19, and 27 with stride 8. With stride 4, both inspected threads write index 7. The duplicate writes store the same value, so the output comparison cannot detect them.",
    native: "Export both 35-element cases and compare the output arrays in Check the output. The chosen launches cover the same indices with a different number of threads. Try measuring Median kernel time for both cases after verifying their outputs.",
    evidence: ["trace"],
    reference: "host['values'] * 2",
    cases: [caseOf("35 elements · 16 threads total", stride(35, 8)), caseOf("35 elements · 8 threads total", stride(35, 4)), caseOf("7 elements · 16 threads total", stride(7, 8))],
  },
  transfers: {
    sourceTarget: "out[i] = alpha * x[i] + y[i]",
    title: "Count bytes moved between host and GPU",
    summary: "Separate the kernel’s array accesses from the copies that get data to and from a GPU.",
    intro: [
      "The host is the CPU-side Python program. The device is the GPU. On hardware, the host copies x and y to the device before the kernel runs, then copies out back. The browser prepares all three arrays for each run.",
      "Each active thread reads one element from each input and writes one value to out. The Console calls these Global reads and Global writes because the arrays are in GPU memory available to all threads. The arrays use float32, a numeric format that takes four bytes per element.",
    ],
    predict: "In the 33-element case, how many bytes of array data cross between host and device if x and y start on the host and out returns to the host?",
    exercise: [
      "Select 33 elements in Case and click Run kernel. Record Global reads and Global writes in the Console. Use four bytes per element to calculate the size of the two input copies and the output copy.",
      "In Thread inspector, select Block 1, Thread 1. Compare its recorded event count with Thread 0 in the same block. Which has an index outside the 33-element array?",
      "Switch to 8 elements and run again. Use the Console counts to check the number of elements used, then calculate how many bytes cross between host and device.",
    ],
    explain: "Block 1, Thread 1 has index 33, so the bounds check skips it. The run has 66 global reads and 33 global writes. Each copied array holds 132 bytes, for 396 payload bytes across three copies. For eight elements the three copies total 96 bytes.",
    native: "In Appendix A, run the affine investigation, which computes out = alpha × x + y. Compare Kernel (ms) and Round trip (ms) at each input size. Then compare 1 stream (ms) and 2 streams (ms) to check whether a second stream reduced the measured time.",
    evidence: ["trace"],
    consoleCounters: [["Global reads", "global_read"], ["Global writes", "global_write"]],
    reference: "np.float32(scalars['alpha']) * host['x'] + host['y']",
    cases: [caseOf("33 elements", affine(33)), caseOf("8 elements", affine(8))],
  },
  coalescing: {
    sourceTarget: "out[col, row] = values[row, col]",
    title: "See how threads group memory accesses",
    summary: "Use a matrix transpose to see why neighboring threads can read nearby addresses and write far apart.",
    intro: [
      "A warp is a group of up to 32 threads in a block. A thread’s position in its warp is called a lane. In a two-dimensional block, lanes are numbered across x before moving to the next y. The kernel uses x for the column and y for the row.",
      "A transpose swaps the row and column of every value. The arrays here store each row together. Adjacent lanes read consecutive columns of values[row, col] and write to different rows of out[col, row].",
      "The address model divides each array into 32-byte groups called sectors. One sector holds eight float32 values. Word offset counts four-byte values from the start of an array. The model assumes the start of each array is a sector boundary.",
    ],
    predict: "For the first eight lanes in 8 rows × 32 columns, will the reads of values or the writes to out reach more 32-byte sectors?",
    exercise: [
      "Select 8 rows × 32 columns in Case and click Run kernel. In Thread inspector, select Block (0, 0). Compare Thread (0, 0) and Thread (7, 0). In Selected thread trace, record Word offset for the read from values and the write to out.",
      "In Warp address model, compare Distinct sectors for reads of values and writes to out. The table includes all 32 lanes in this block. Which operation touches more sectors for the same number of accesses?",
      "Switch to 5 rows × 13 columns, run, and select Block (1, 1). In Warp address model, find Accesses and Distinct sectors for reads of values. Why do five consecutive reads touch two sectors here?",
    ],
    explain: "Across all 32 lanes in the 8 × 32 case, reads touch four sectors and writes touch 32. In the 5 × 13 edge block, five lanes read word offsets 60–64, which cross a sector boundary. The five writes span four sectors. The browser counts address groups, and the transactions on hardware also depend on the GPU and the instructions it runs.",
    native: "In Appendix A, profile the direct and tiled transposes at the same shape. Compare effective bandwidth and use Nsight Compute to inspect global load and store sectors.",
    evidence: ["trace", "warp"],
    traceDetails: ["offset"],
    reference: "host['values'].T",
    cases: [caseOf("8 rows × 32 columns", transpose(8, 32, 32, 1)), caseOf("5 rows × 13 columns", transpose(5, 13, 8, 4))],
  },
  divergence: {
    sourceTarget: "if x < 0:",
    title: "When threads take different branches",
    summary: "Compare how two arrangements of the same number of negative and positive inputs affect groups of GPU threads.",
    intro: [
      "A branch is a choice between paths, such as the if and else parts of an if statement. Warp divergence occurs when threads in one warp take different paths. A GPU can run the instructions for a path with only the lanes that chose it active.",
      "Each block in these cases has one 32-lane warp. The kernel multiplies negative inputs by 0.25 and copies positive inputs. The browser lets you count the lanes taking each path. Hardware timing also depends on how the compiler implements the condition and how much each path does.",
    ],
    predict: "Both cases have 64 inputs. Alternating signs switches between negative and positive, starting with a negative value. Grouped signs puts the negative values first, then the positive values, 32 of each. How many lanes in Block 0 take the negative path in each case? How many blocks contain both paths?",
    exercise: [
      "Select Alternating signs in Case and click Run kernel. The first two inputs are −1 and 2. Compare them with the first two entries of out in the Console. Which input was multiplied by 0.25?",
      "The output keeps the sign of each input. In the Console, open Compare with starter and count the negative entries in the Actual column at indices 0–31 for Block 0 and 32–63 for Block 1.",
      "Select Grouped signs and run again. In Compare with starter, count the negative entries in the same two ranges. In which case does a single warp contain lanes that take both paths?",
    ],
    explain: "Alternating signs puts 16 lanes on each path in both warps. Grouped signs puts all 32 negative values in Block 0 and all 32 positive values in Block 1. A timing difference on a GPU depends on the compiled instructions and the work on each path.",
    native: "Run both cases in GPU notebooks and verify the outputs. For a controlled timing comparison, use inputs of the same size with the same values reordered. Inspect the generated code before attributing a timing difference to the branch.",
    evidence: [],
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
      "A reduction combines many values into fewer results. Here each block adds its portion of the input to make one sum. Each thread writes one input value into scratch. Threads beyond the last input write zero. Scratch is in shared memory, which threads in one block can read and write.",
      "A block barrier, written cuda.syncthreads(), makes every thread in the block wait until all have reached that line. The first barrier lets every thread finish writing its starting value. The block then adds pairs of values, with another barrier between steps. The starter uses a power-of-two block size of at most 32 threads, the size of scratch.",
    ],
    predict: "In the eight-thread block, the first pairs are four positions apart. Which thread adds scratch[5] to its own value? What must be ready before it reads scratch[5]?",
    exercise: [
      "Select 16 values · 8 threads per block in Case and click Run kernel. In Thread inspector, choose Block 0, Thread 1. In Selected thread trace, find the read with Index 5.",
      "In reduction.py, delete the cuda.syncthreads() immediately after the first scratch[lane] assignment. Run again. Which entry does the Console say was read before it was written?",
      "In Editor tools, select Restore starter. Switch to 19 values · partial block and run. In Block 2, select Thread 3 and find its first write in Selected thread trace. Why is Value 0?",
    ],
    explain: "Thread 1 reads scratch[5] when it adds the value four slots away. Without the first barrier, the browser runs Thread 0 before Thread 4 and reports a read of scratch[4] before initialization. The browser uses one run order, so passing the check cannot establish that the kernel works for every order on a GPU. In the 19-value case, Block 2, Thread 3 has global index 19, outside the array. It contributes zero.",
    native: "In a starter notebook, compare the sum of the GPU’s block totals with the sum of the NumPy input. The GPU output contains one partial sum per block; the host sum combines them.",
    evidence: ["trace"],
    traceDetails: ["shared"],
    reference: "np.array([host['values'][i:i+threads[0]].sum() for i in range(0, scalars['n'], threads[0])])",
    cases: [caseOf("16 values · 8 threads per block", reduction(16, 8)), caseOf("19 values · partial block", reduction(19, 8)), caseOf("39 values · 32 threads", reduction(39, 32))],
  },
  histogram: {
    sourceTarget: "cuda.atomic.add(counts, tokens[i], 1)",
    title: "Count inputs by category",
    summary: "Count how many inputs choose each category when several threads update the same counter.",
    intro: [
      "A histogram counts how many inputs fall into each category. The inputs here are integers called tokens. Each token is the index of one of four counters in counts. The browser resets all counters to zero before each run.",
      "cuda.atomic.add reads a counter, adds one, and writes the new value as a single update. This ensures each increment is counted on a GPU even if threads choose the same counter. The browser runs these threads one at a time in a fixed order.",
    ],
    predict: "When all 32 tokens go to destination 2, which counter changes? What count could two threads produce if both read zero before either writes?",
    exercise: [
      "Run Balanced destinations and record counts from the Console. Then run All tokens route to 2 and compare counts[2] across the two cases.",
      "Keep All tokens route to 2. Select Block 0 in Thread inspector and inspect Threads 0 and 1 in turn. In Selected thread trace, find the entries for counts at Index 2 and record the Action.",
      "In histogram.py, replace cuda.atomic.add(counts, tokens[i], 1) with counts[tokens[i]] += 1 and run again. Inspect the same threads. How did Action change? Does counts[2] still match the starter reference?",
      "In Editor tools, select Restore starter.",
    ],
    explain: "In the balanced case each counter gets eight increments. When all tokens route to 2, that counter gets all 32. The plain increment records a read and a write in place of each atomic update. The browser still counts 32 because it runs the increments in order. On a GPU, the interleaving below can lose an increment.",
    native: "Run both starter cases on a GPU. Compare the result with NumPy’s bincount. To study contention (threads competing to update the same address), use larger balanced and single-destination inputs of equal size and reset the counters before every launch.",
    evidence: ["trace"],
    reference: "np.bincount(host['tokens'], minlength=4)",
    cases: [caseOf("Balanced destinations", histogram(range(32).map((i) => i % 4))), caseOf("All tokens route to 2", histogram(Array(32).fill(2)))],
  },
  scan: {
    sourceTarget: "previous = scratch[lane - distance] if lane >= distance else 0\n        cuda.syncthreads()",
    title: "Find positions with running totals",
    summary: "Build running totals and use them to find positions for values you keep.",
    intro: [
      "An inclusive scan at index i adds values[0] through values[i]. If the values are flags (1 means keep, 0 means discard), a kept item’s position is its running total minus one. The kernel writes the running totals to out so you can find those positions.",
      "At each step, a thread looks back a fixed distance and saves the old value from scratch before changing its own entry. One barrier lets the threads finish reading. A second barrier lets them finish writing before the distance doubles.",
    ],
    predict: "For [1, 0, 1, 1, 0, 0, 1], what running total do you expect at index 6? Where would that element move?",
    exercise: [
      "Select Keep flags · 7 elements in Case and click Run kernel. Read out[6], the seventh entry in the Console, and use it to find the kept item’s new position.",
      "In Block 0, select Thread 6. In Selected thread trace, find the reads from shared memory with indices 5, 4, and 2. How far to the left of 6 is each read?",
      "In scan.py, remove only the cuda.syncthreads() immediately after the line that starts previous =. Run again and open Compare with starter. Find the first index where Actual and Starter reference differ.",
      "In Editor tools, select Restore starter. Select Weighted counts · 13 elements and run again. What does the last value of out represent when the inputs are weights?",
    ],
    explain: "Thread 6 reads scratch[5], scratch[4], and scratch[2] at distances 1, 2, and 4. Without the read barrier, threads can read a value from the current stage instead of the previous one. In the weighted case, out[12] is 26, the sum of all 13 weights.",
    native: "Run the Keep flags notebook. In Check the output, add print(actual[host['values'] != 0] - 1) after print(actual). Check that the printed positions for the kept inputs are 0, 1, 2, and 3.",
    evidence: ["trace"],
    traceDetails: ["shared"],
    reference: "np.cumsum(host['values'], dtype=np.int32)",
    cases: [caseOf("Keep flags · 7 elements", scan([1, 0, 1, 1, 0, 0, 1], 8)), caseOf("Weighted counts · 13 elements", scan([2, 4, 0, 3, 1, 5, 0, 0, 1, 2, 3, 4, 1], 16))],
  },
  "tiled-transpose": {
    sourceTarget: "PADDING = 1",
    title: "Transpose through a shared tile",
    summary: "Pass values through shared memory so neighboring threads can write neighboring output columns.",
    intro: [
      "A tile is a small rectangular region of a matrix. Each block loads one tile into shared memory. After a barrier, threads read it with the coordinates swapped and write the transposed values.",
      "GPU shared memory is divided into banks that can serve requests independently. The browser uses a 32-bank model where Shared bank is Word offset % 32. In this example, padding adds an unused four-byte word to each row of the tile, which changes where the next row starts.",
    ],
    predict: "In Block (0, 0) of the 8 × 8 case, which thread loads the input value that Thread (2, 0) writes to out[0, 2]?",
    exercise: [
      "Select 8 rows × 8 columns in Case and click Run kernel. In Block (0, 0), select Thread (0, 2) and find the write to shared memory. Then select Thread (2, 0) and find its shared read at the same Index.",
      "In tiled-transpose.py, set PADDING = 0 and run again. Compare Index, Word offset, and Shared bank for Thread (2, 0)’s shared read with padding on and off. Check whether the Console still reports a match with the starter reference.",
      "In Editor tools, select Restore starter. Run 11 rows × 13 columns and open Compare with starter. Check Actual and Starter reference at the last output index, (12, 10).",
    ],
    explain: "The shared word offset and modeled bank change from 18 to 16 when you remove padding. The address shows how padding changes the bank mapping. A bank conflict can delay lanes that request different words from the same bank. Use hardware measurements to find out whether padding reduces conflicts for a larger tile.",
    native: "In Appendix A, run the transpose investigation. Compare the direct, unpadded, and padded kernels at the same shape. Inspect the shared-load bank conflicts before attributing a bandwidth difference to padding.",
    evidence: ["trace"],
    traceDetails: ["shared", "offset", "bank"],
    reference: "host['values'].T",
    cases: [caseOf("8 rows × 8 columns", transpose(8, 8, 8, 8)), caseOf("11 rows × 13 columns", transpose(11, 13, 8, 8))],
  },
  matmul: {
    sourceTarget: "tile_a[ty, tx] = a[row, a_col] if row < m and a_col < k else 0",
    title: "Reuse inputs in matrix multiplication",
    summary: "Reuse pieces of the two input matrices while computing a matrix product.",
    intro: [
      "To compute out[row, col], take one row of a and one column of b. Multiply entries at the same position and sum the products. The number of products is the inner dimension k, the number of columns in a and rows in b.",
      "In each pass the block copies one 4 × 4 tile from each input into shared memory, using zero for positions outside the input. A barrier makes both tiles ready. Each thread adds four products to its own total. A second barrier waits for the threads to finish using both tiles before loading the next pair.",
    ],
    predict: "For 5 × 6 times 6 × 7, which inner indices fall outside the input in the second pass?",
    exercise: [
      "Select 5 × 6 times 6 × 7 in Case and click Run kernel. In Block (0, 0), select Thread (0, 0). In Selected thread trace, find the two writes to the shared array created by tile_a = cuda.shared.array. The trace labels each shared array with the line that creates it.",
      "Find the reads from shared arrays after the barrier in each pass. In the Console, compare Global reads and Shared reads. How can the same input value be read from shared memory by several threads?",
      "In Block (1, 1), select Thread (3, 3). Find the writes of zero to shared memory and the barrier entries. Does this thread write to out?",
    ],
    explain: "The second tile covers inner indices 4–7, so indices 6 and 7 contribute zero. Each loaded value can serve several output cells through shared reads. Thread (3, 3) in Block (1, 1) has no output cell, but it still participates in tile loading and reaches the barriers.",
    native: "Run both starter notebooks and check that each output matches NumPy. Note the input shapes and Median kernel time. The cases have different shapes and different amounts of work, so use larger, matching input shapes when comparing different kernel implementations.",
    evidence: ["trace"],
    traceDetails: ["shared"],
    consoleCounters: [["Global reads", "global_read"], ["Shared reads", "shared_read"]],
    reference: "host['a'] @ host['b']",
    cases: [caseOf("5 × 6 times 6 × 7", matmul(5, 6, 7)), caseOf("4 × 4 times 4 × 4", matmul(4, 4, 4))],
  },
  softmax: {
    sourceTarget: "math.exp(values[row, col] - row_max)",
    title: "Build a stable softmax",
    summary: "Turn scores into probabilities without overflowing the exponential.",
    intro: [
      "Softmax converts a row of scores, also called logits, to probabilities that add to one. Use math.exp to raise e to the power of each score. Divide each result by the sum of those results. The exponential of a large score can be too large for the numeric format, which is called overflow.",
      "The kernel first subtracts the row maximum. Every shifted score is then zero or negative, so every exponential is at most one. The common shift preserves the probability ratios. One block handles each row. A thread with no column contributes −∞ to the maximum and zero to the sum, so it leaves both calculations unchanged.",
    ],
    predict: "Row 0 is [1000, 999, 1000, 997, −1000]. What is the exponential of the largest score after subtracting the row maximum? Which two columns should have equal probabilities?",
    exercise: [
      "Select Extreme and equal logits in Case and click Run kernel. In the Console, compare the first and third values in row 0 of out. Check whether Row sums are close to 1.",
      "In Block 0, select Thread 0. In Selected thread trace, find the reads of scratch[0] that supply the row maximum and the sum of shifted exponentials.",
      "In softmax.py, replace both math.exp(values[row, col] - row_max) calls with math.exp(values[row, col]). Run again and read the Console error. In Editor tools, select Restore starter.",
      "Run Two rows · 37 columns. In Block 0, select Thread 0 and find its writes to columns 0 and 32 in Selected thread trace. Why does the same thread write both?",
    ],
    explain: "Removing the shift makes exp(1000) overflow in the browser. Columns 0 and 2 get equal probabilities because they start at the same score and use the same divisor. Even with the shift, a very small probability can round to zero in float32. In the 37-column case, Thread 0 visits columns 0 and 32 because the loop uses 32 columns per step, one for each thread in the block.",
    native: "In Appendix A, run the softmax investigation. Compare your kernel with torch.softmax on the same float32 input buffers. Check the probabilities before comparing CUDA event times across row widths.",
    evidence: ["trace"],
    traceDetails: ["shared"],
    reference: "(lambda exps: exps / exps.sum(axis=1, keepdims=True))(np.exp(host['values'] - host['values'].max(axis=1, keepdims=True)))",
    cases: [
      caseOf("Extreme and equal logits", softmax([[1000, 999, 1000, 997, -1000], [-1002, -1001, -1000, -1000, -1004]])),
      caseOf("Two rows · 37 columns", softmax([range(37).map((i) => i % 9 - 4), range(37).map((i) => 800 + i % 5)])),
    ],
  },
  gather: {
    sourceTarget: "indices[i]",
    title: "Read values through an index array",
    summary: "Trace a gather, where each output selects an input using a separate index array.",
    intro: [
      "A gather looks up values at positions listed in another array. In gather.py, Thread i reads indices[i], uses that value to select an input from values, and writes the answer to out[i]. The case supplies eight indices and a table of 64 values.",
      "In both cases, lanes read indices consecutively. The positions stored there determine whether their reads of values are close together. The browser groups addresses into 32-byte sectors with eight four-byte values per sector.",
    ],
    predict: "If the eight indices are [0, 8, 16, 24, 32, 40, 48, 56], how many sectors do reads of indices and reads of values touch?",
    exercise: [
      "Select Consecutive positions and click Run kernel. In Warp address model, record Distinct sectors for read · indices and read · values.",
      "Select Spaced positions and run again. In Thread inspector, select Thread 1 and find the two reads in Selected thread trace. Which value read from indices becomes the index used to read values?",
      "In gather.py, replace values[indices[i]] with values[i]. Run the Spaced positions case again. Compare out and the read · values sector count before and after the edit. In Editor tools, select Restore starter.",
    ],
    explain: "With consecutive positions, the lanes touch one sector in each input array. With spaced positions they still touch one sector in indices but touch eight in values. Reading values[i] changes the chosen inputs, so fewer modeled sectors comes with a different result. Hardware traffic also depends on caching and instruction behavior.",
    native: "Run both notebooks and check each output against NumPy indexing. Compare the output order. Use larger inputs and a memory profiler to study hardware traffic, since these eight requests are too small for a throughput comparison.",
    evidence: ["trace", "warp"],
    traceDetails: ["offset"],
    reference: "host['values'][host['indices']]",
    cases: [caseOf("Consecutive positions", gather(range(8))), caseOf("Spaced positions", gather(range(8).map((i) => i * 8)))],
  },
  stencil: {
    sourceTarget: "tile[0] = values[i - 1] if i > 0 else 0.0",
    title: "Share neighboring values across threads",
    summary: "Sum each element and its neighbors while reusing inputs in shared memory.",
    intro: [
      "A stencil applies the same rule at each position using nearby inputs. Here the rule adds the left neighbor, the current value, and the right neighbor. The kernel uses zero for neighbors outside the array.",
      "The shared version uses eight threads per block. Each thread loads one center value into a tile. The first and last threads load the two extra neighboring values, called the halo. A barrier makes those values available to the whole block before it writes outputs.",
    ],
    predict: "At the first position of Block 1, which input from Block 0 must the stencil include? Which shared entry holds it?",
    exercise: [
      "Run 16 values · direct reads, then 16 values · shared tile. Compare Global reads and the Console check for both cases. How did staging the same inputs once per tile change the read count?",
      "With the shared case selected, inspect Block 1, Thread 0. Find the read from values at Index 7 and the write to the shared array at Index 0. Follow that value to the first output of Block 1.",
      "In stencil.py, replace tile[0] = values[i - 1] if i > 0 else 0.0 with tile[0] = 0.0. Run the shared case again and open Compare with starter. Find which output missed an input from the previous block.",
      "In Editor tools, select Restore starter. Run 13 values · partial tile to verify the outputs when some threads have no center value.",
    ],
    explain: "The direct case records 46 global reads. Shared staging uses 18, including the two reads across the boundary between blocks. Block 1, Thread 0 loads input index 7 into tile[0]. Replacing the left halo with zero changes out[8] from 27 to 19. The browser counts the reads in the source. Repeated reads can hit a hardware cache.",
    native: "Run the two complete-tile notebooks and check their NumPy outputs. Use matching, larger input arrays to compare hardware time. The direct reads can benefit from the cache, while shared staging has loads and a block barrier.",
    evidence: ["trace"],
    traceDetails: ["shared"],
    consoleCounters: [["Global reads", "global_read"], ["Shared reads", "shared_read"]],
    reference: "(lambda x: x[:-2] + x[1:-1] + x[2:])(np.pad(host['values'], 1))",
    cases: [caseOf("16 values · direct reads", stencil(16, 0)), caseOf("16 values · shared tile", stencil(16, 1)),
      caseOf("13 values · partial tile", stencil(13, 1))],
  },
  precision: {
    sourceTarget: "float32(a[i] + b[i])",
    title: "See how rounding changes a sum",
    summary: "Group the same three values in two orders and check their float32 results.",
    intro: [
      "Float32 stores numbers with limited precision. Around 16,777,216, the next larger float32 value is 16,777,218. Adding 1 to 16,777,216 and rounding to float32 gives 16,777,216 again.",
      "The explicit float32 calls round each sum at the same point in the browser and in the GPU notebook. Changing parentheses changes when a small value can be lost to rounding.",
    ],
    predict: "For a = 16,777,216, b = 1, and c = −16,777,216, what happens to the 1 when you add a and b first? What if you add a and c first?",
    exercise: [
      "Select Near the precision limit and run. Thread 0 starts with 16,777,216 and Thread 1 starts with 8,388,608. Both threads add 1 and then subtract their starting value. Check out[0] and out[1] in the Console. Which thread keeps the 1?",
      "In precision.py, change a[i] + b[i] to a[i] + c[i] and change first + c[i] to first + b[i]. Run again and compare the same outputs. Explain why changing the order changes one result.",
      "Restore starter in Editor tools, then run Smaller integers. Check whether the original grouping keeps 1 for those values.",
    ],
    explain: "The first case starts with a values of 16,777,216 and 8,388,608. The original order returns 0 for the first thread and 1 for the second. Canceling a and c before adding b gives 1 for both. The starter reference follows the original float32 grouping. The exact sum is 1 for both inputs, so the edited result at index 0 is closer to the exact sum.",
    native: "Run the starter and the edited versions of the first case. In Check the output, add print(host['a'].astype(np.float64) + host['b'] + host['c']) at the end of the cell. Compare the float32 results with this calculation in a type with more precision.",
    evidence: [],
    reference: "(host['a'] + host['b']) + host['c']",
    cases: [caseOf("Near the precision limit", precision([2 ** 24, 2 ** 23])), caseOf("Smaller integers", precision([100, 1000]))],
  },
  "sync-debug": {
    sourceTarget: "slot[lane] = i if i < n else -1",
    title: "Find a barrier skipped by an edge thread",
    summary: "Use a partial block to expose a synchronization bug that a full block passes.",
    intro: [
      "Each block has four threads. A thread writes its global index to shared memory, or −1 if its index is outside the output. After the block barrier, each active thread copies the next thread’s entry. The last thread in a block reads the first entry.",
      "Every thread in a block must reach the barrier together. The browser checks the arrivals when it executes each step. The partial-block case has one thread in Block 1 whose index is outside the output.",
    ],
    predict: "In the 7-output case, which thread in Block 1 supplies the −1? What happens to the barrier if that thread returns first?",
    exercise: [
      "Run 7 outputs · partial block. Find out[6] in the Console and inspect Block 1, Thread 3. Which write and barrier entry let Thread 2 read the sentinel value −1?",
      "In sync-debug.py, insert two lines just before slot[lane] = i if i < n else -1. On the first line, type if i >= n: at the same indentation as slot[lane]. On the second line, indent four more spaces and type return.",
      "Run 8 outputs · two full blocks first. Then run 7 outputs · partial block with the same edit. Compare the Console messages. Why does the smallest change in output size expose the problem?",
      "In Editor tools, select Restore starter and rerun the 7-output case.",
    ],
    explain: "The edited kernel has no early returns in the eight-output case. In the seven-output case, Block 1, Thread 3 returns before the other threads reach the barrier, and the browser reports inconsistent arrivals. Test both full and partial blocks when checking a synchronization rule.",
    native: "Run the starter notebook for both input sizes. For hardware debugging tools, follow Find incorrect memory accesses and synchronization in Appendix A.",
    evidence: ["trace"],
    traceDetails: ["shared"],
    reference: "(lambda i: np.where(i < scalars['n'], i, -1))((np.arange(scalars['n']) // 4) * 4 + (np.arange(scalars['n']) + 1) % 4)",
    cases: [caseOf("7 outputs · partial block", syncDebug(7)), caseOf("8 outputs · two full blocks", syncDebug(8))],
  },
  fusion: {
    sourceTarget: "if use_temp:",
    title: "Remove an intermediate array",
    summary: "Keep a value inside a thread instead of writing it out and reading it back.",
    intro: [
      "The first operation scales x and adds y. The second replaces negative results with zero. Putting both operations in one kernel is called fusion. It can save memory accesses when a thread can use its intermediate value directly.",
      "Both browser cases use one kernel. One case explicitly writes temp and reads it back. The other keeps the value in a local variable. The hardware capstone compares separate launches with a fused launch.",
    ],
    predict: "For eight inputs, how many global reads and writes can you remove if each thread skips its write to temp and its read from temp?",
    exercise: [
      "Select 8 values · store temporary and click Run kernel. Record Global reads, Global writes, and out in the Console.",
      "Select 8 values · keep local and run. Compare the same counts and check whether out changed. Inspect Thread 0’s trace to identify the two missing operations.",
      "Select 8 values · store temporary. In fusion.py, change if use_temp: to if False: and run. Do the resulting access counts match the keep-local case? In Editor tools, select Restore starter.",
      "For the optional capstone, use Appendix A to test whether fewer launches and accesses reduce the time on an NVIDIA GPU.",
    ],
    explain: "For eight elements, the temporary adds eight reads and eight writes. The local version reads x and y and writes only out, for 16 reads and eight writes. Both versions produce the same values. The access counts are a source-level prediction for the hardware capstone, since memory traffic also depends on what the compiler and caches do.",
    native: "In Appendix A, run the profiling capstone to compare a two-launch baseline with a fused kernel across input sizes and block sizes. Verify both outputs and check whether the measured kernel time supports your prediction.",
    evidence: ["trace"],
    consoleCounters: [["Global reads", "global_read"], ["Global writes", "global_write"]],
    reference: "np.maximum(np.float32(scalars['alpha']) * host['x'] + host['y'], np.float32(0))",
    cases: [caseOf("8 values · store temporary", fusion(8, 1)), caseOf("8 values · keep local", fusion(8, 0)),
      caseOf("13 values · keep local", fusion(13, 0))],
  },
};
