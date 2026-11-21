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
    description: "Follow data across the host/device boundary, through memory, and into warps.",
    lessons: ["transfers", "coalescing", "divergence"],
  },
  {
    title: "Parallel patterns",
    description: "Coordinate threads with barriers and atomics, then turn counts into offsets.",
    lessons: ["reduction", "histogram", "scan"],
  },
  {
    title: "Optimization and ML",
    description: "Reuse data in shared memory, test performance hypotheses, and integrate a kernel with PyTorch.",
    lessons: ["tiled-transpose", "matmul", "softmax"],
  },
];

export const lessons = {
  "first-value": {
    title: "Write your first GPU value",
    summary: "Write one value from a GPU thread, then follow it back to the host.",
    concepts: ["Kernel launch", "Host and device"],
    intro: [
      "A kernel is a function the host launches on the GPU. The same kernel function runs once per launched thread. This launch has one block with one thread, so only that thread writes to the output.",
      "In a native Python program, kernel[blocks, threads](out) launches the work. The host allocates the device array before the launch and reads a copy after the kernel has completed.",
    ],
    predict: "If you change 42 to 73, which thread writes which output cell? What do you expect the reference check to report?",
    exercise: "Run the starter. Change 42 to 73 and run again. Select thread 0 to inspect the write, then restore the starter and verify the original result.",
    explain: "The GPU thread executes an assignment to out[0]. Changing the constant changes the written value. The independent reference still expects 42, so it catches the edit.",
    native: "Run the same kernel from the notebook. Identify the host-side allocation, kernel launch, and copy back to the host. Try launching two threads and explain why two writes to one address are a poor way to initialize an array.",
    reference: 'np.array([42], dtype=np.float32)',
    cases: [caseOf("One element", fixture({ out: zeros([1]) }, "out", ["out"], {}, [1], [1], [42]))],
  },
  "vector-add": {
    title: "One thread, one element",
    summary: "Map threads to array elements and handle a launch that extends past the last value.",
    concepts: ["Thread indexing", "Bounds checks"],
    intro: [
      "Thread indices start at zero inside each block. In one dimension, cuda.grid(1) computes blockIdx.x × blockDim.x + threadIdx.x. Rounding up the number of blocks gives every element a thread.",
      "When the array length is not a multiple of the block size, some launched threads have no element to process. They still execute the kernel, but the bounds check skips their reads and writes.",
    ],
    predict: "With 33 elements and 32 threads per block, which block and thread write index 32? How many threads in that block produce no memory events?",
    exercise: "Run the 33-element case and select block 1. Compare its first two threads. Then use the 16-thread case and locate the same output index. Remove the bounds check to see the bad index the model reaches.",
    explain: "With 32 threads per block, index 32 is block 1, thread 0. With 16 threads per block, it is block 2, thread 0. Both launches cover the same array using different grid sizes.",
    native: "Try lengths 31, 32, and 33 around the block boundary. Compare every output against a + b. Change both the device launch dimensions and the arrays when adding a new case.",
    reference: "host['a'] + host['b']",
    cases: [caseOf("33 elements · 32 threads", vector(33, 32)), caseOf("33 elements · 16 threads", vector(33, 16)), caseOf("32 elements · exact fit", vector(32, 32))],
  },
  "grid-stride": {
    title: "Let each thread do more work",
    summary: "Use a grid-stride loop to cover more inputs than there are threads in the launch.",
    concepts: ["Grid-stride loops", "Work assignment"],
    intro: [
      "A grid-stride loop begins at the global thread index and advances by the total number of threads in the launch. Threads in adjacent lanes continue to visit adjacent addresses on each iteration.",
      "A grid-stride loop gives you a way to vary the launch size while covering the same input. It also creates useful edge cases when the input is shorter than the launch or ends partway through a loop iteration.",
    ],
    predict: "With two blocks of eight threads, which indices will block 0, thread 3 visit in a 35-element input?",
    exercise: "Inspect thread 3 in the 35-element case. Switch to four threads per block and trace it again. Change the stride to cuda.blockDim.x and compare both the numeric check and the write trace.",
    explain: "The original stride is 16, so thread 3 visits 3 and 19. Thread 3 with eight total threads visits 3, 11, 19, and 27. Using just blockDim.x can cause duplicate writes that happen to produce equal values.",
    native: "Sweep launch sizes on a large array. Record CUDA event time and explain how choosing fewer blocks can change parallelism even when every element is still visited.",
    reference: "host['values'] * 2",
    cases: [caseOf("35 elements · 16 threads total", stride(35, 8)), caseOf("35 elements · 8 threads total", stride(35, 4)), caseOf("7 elements · 16 threads total", stride(7, 8))],
  },
  transfers: {
    title: "Where did the time go?",
    summary: "Follow an affine transform from NumPy to CUDA and back, then measure each part on hardware.",
    concepts: ["Host/device transfers", "CUDA events"],
    intro: [
      "The kernel computes out = alpha × x + y. It loads two values and writes one float32 result per active thread. The native program also allocates buffers and moves data across the host/device boundary.",
      "Use CUDA events around work on the same stream to measure GPU execution. Use a host clock and wait for completion to measure a round trip. Warm up compilation and allocation before comparing steady-state results.",
    ],
    predict: "For 33 float32 elements, how many bytes must the two inputs and one output move if they start and finish on the host?",
    exercise: "Run the 33-element case. Use the trace totals to count global reads and writes. Find a thread with no memory events and explain why that thread does not change the byte count.",
    explain: "Two uploads and one download of 33 × 4 bytes account for 396 payload bytes. The trace describes the kernel's logical array accesses. The notebook and GPU investigation measure the host/device workflow.",
    native: "Run profile_workloads.py affine on an NVIDIA GPU. Compare the device-resident and round-trip times over several input sizes. Then compare a single stream with a batched two-stream pipeline using pinned input and output buffers.",
    reference: "np.float32(scalars['alpha']) * host['x'] + host['y']",
    cases: [caseOf("33 elements", affine(33)), caseOf("8 elements", affine(8))],
  },
  coalescing: {
    title: "Follow a warp’s addresses",
    summary: "Trace contiguous loads and strided stores in a simple matrix transpose.",
    concepts: ["Warp lanes", "Coalescing"],
    intro: [
      "The GPU groups threads in warps of up to 32 lanes. The x coordinate changes fastest in the linear thread order. Adjacent lanes that access adjacent float32 values can share the same 32-byte memory sector.",
      "In a row-major matrix, values[row, col] is contiguous as col increases. In this transpose those same lanes store at out[col, row], so the starting addresses of their writes are separated by the output row stride.",
    ],
    predict: "For the first eight lanes of the 8 × 32 case, which group covers more distinct 32-byte sectors in the address model, the loads or the stores?",
    exercise: "Run the 8 × 32 case. Open the warp address table and compare the input and output rows. Then select the rectangular edge case. Explain how row stride and the number of active lanes change the address groups.",
    explain: "In the aligned 8 × 32 case, the first eight loads fit in one sector. Each of their stores starts in a different sector because consecutive output rows are eight floats apart. The table assumes aligned array bases and groups logical accesses; actual transactions depend on the GPU and instruction.",
    native: "Profile the direct and tiled transpose together in profile_workloads.py transpose. Compare memory throughput and, if Nsight Compute is available, the global load/store sector metrics.",
    reference: "host['values'].T",
    cases: [caseOf("8 rows × 32 columns", transpose(8, 32, 32, 1)), caseOf("5 rows × 13 columns", transpose(5, 13, 8, 4))],
  },
  divergence: {
    title: "When lanes take different branches",
    summary: "Change the data and follow two paths through a single CUDA warp.",
    concepts: ["Predicates", "Warp divergence"],
    intro: [
      "A warp may contain lanes that take different paths through a conditional. The GPU can execute instructions with only some lanes active. A compiler may also use predication for a short branch.",
      "This example applies a scale to negative inputs. Use the input values in a warp to count lanes on each path. The browser executes functional Python and has no hardware instruction or timing model.",
    ],
    predict: "How many lanes in the first warp take the negative path for alternating signs? How does that change when negatives are grouped?",
    exercise: "Compare the two 64-element inputs. Look at example positive and negative lanes. For each layout, count how many warps contain both signs.",
    explain: "Alternating signs put 16 lanes on each path in both warps. Grouping signs puts one path in each warp. A timing difference depends on the generated instructions and how much work each path performs.",
    native: "On a GPU, compare both input layouts with the same size and distribution. Amplify the work on one branch and check the generated code and profiler before attributing a timing difference to divergence.",
    reference: "np.where(host['values'] < 0, host['values'] * np.float32(0.25), host['values'])",
    cases: [
      caseOf("Alternating signs", divergence(range(64).map((i) => (i + 1) * (i % 2 ? 1 : -1)))),
      caseOf("Grouped signs", divergence(range(64).map((i) => (i + 1) * (i < 32 ? -1 : 1)))),
    ],
  },
  reduction: {
    title: "Add values across a block",
    summary: "Reduce an array to one partial sum per block using shared memory.",
    concepts: ["Shared memory", "Block barriers"],
    intro: [
      "Every thread first loads a value or a zero into shared memory. At each stage, half the remaining lanes combine two partial sums. A block-wide barrier separates each stage so the next read sees the preceding writes.",
      "All lanes in the block reach the barrier, including lanes that do no addition in that stage. The starter expects a power-of-two block size no greater than the shared array length.",
    ],
    predict: "In a block of eight threads, which lane first reads the value placed in scratch[5]? What happens if that read races with the initial write?",
    exercise: "Inspect thread 1 and the shared-memory phases. Remove the barrier before the loop and try again. Restore it, then use a case with a partial final block to find the lanes that contribute zeros.",
    explain: "Thread 1 reads scratch[5] when distance is four. The initial barrier makes the array ready. The browser can detect some reads before initialization. Its deterministic order cannot prove a kernel is race-free.",
    native: "Sum the device's block totals on the host and compare with NumPy. As an extension, launch a second reduction kernel over those partial sums and measure the cost.",
    reference: "np.array([host['values'][i:i+threads[0]].sum() for i in range(0, scalars['n'], threads[0])])",
    cases: [caseOf("16 values · 8 threads", reduction(16, 8)), caseOf("19 values · partial block", reduction(19, 8)), caseOf("39 values · 32 threads", reduction(39, 32))],
  },
  histogram: {
    title: "Count token destinations safely",
    summary: "Use atomic updates when multiple CUDA threads increment the same counter.",
    concepts: ["Atomics", "Contention"],
    intro: [
      "A token histogram counts how many inputs route to each destination. Multiple threads can update the same counter concurrently. cuda.atomic.add combines the read, addition, and store into an indivisible operation for that address.",
      "The browser runs threads in a deterministic order within each phase. A plain counts[token] += 1 might pass here even though it has a race on the GPU.",
    ],
    predict: "Which counters receive the most atomic updates when all tokens share one destination? What path could lose an increment with separate reads and writes?",
    exercise: "Compare the balanced and single-destination cases. In the trace, find two threads updating the same address. Replace the atomic with a plain increment, then compare the trace even if the final counts agree.",
    explain: "Two non-atomic increments can both read the same old count and store the same new count. Atomics preserve both increments. Skewed inputs concentrate contention even when the count of updates stays the same.",
    native: "Sweep balanced and skewed inputs on hardware. Zero counters between launches and verify with np.bincount. Try a block-local histogram and merge its counters into global memory.",
    reference: "np.bincount(host['tokens'], minlength=4)",
    cases: [caseOf("Balanced destinations", histogram(range(32).map((i) => i % 4))), caseOf("All tokens route to 2", histogram(Array(32).fill(2)))],
  },
  scan: {
    title: "Build positions from prefix sums",
    summary: "Turn per-token counts into cumulative counts using an inclusive block scan.",
    concepts: ["Prefix sums", "Stable positions"],
    intro: [
      "An inclusive scan at index i is the sum of values[0] through values[i]. For a binary keep flag, a kept input's zero-based destination is its inclusive count minus one. Kept inputs retain their original order.",
      "At distance d, every lane reads its predecessor from the old stage before any lane updates the shared array. The starter separates read and write phases with two block barriers per iteration.",
    ],
    predict: "For flags [1, 0, 1, 1, 0, 0, 1], where should input index 6 move? Which distances contribute to its final prefix?",
    exercise: "Run the keep-mask case and inspect lane 6 across phases. Remove the barrier between reading previous and updating scratch. Compare the result with the independent reference, then restore the barrier.",
    explain: "The prefix at input 6 is four, so the compacted position is three. The scan uses distances one, two, and four. To extend across blocks, scan each block, scan its total separately, and add the earlier blocks' totals to their outputs.",
    native: "Use the exported scan as the first pass of a stable stream compaction pipeline. Add a pass to scan block totals and a scatter pass; verify against values[keep] in NumPy.",
    reference: "np.cumsum(host['values'], dtype=np.int32)",
    cases: [caseOf("Keep flags · 7 elements", scan([1, 0, 1, 1, 0, 0, 1], 8)), caseOf("Weighted counts · 13 elements", scan([2, 4, 0, 3, 1, 5, 0, 0, 1, 2, 3, 4, 1], 16))],
  },
  "tiled-transpose": {
    title: "Transpose through a shared tile",
    summary: "Change the shape of global stores by rearranging data in shared memory.",
    concepts: ["Tiling", "Shared memory banks"],
    intro: [
      "First, neighboring lanes read neighboring columns into a tile. The block synchronizes. Threads then read the tile with swapped coordinates, so neighboring lanes write neighboring output columns.",
      "Shared memory is organized into banks. For a simple 32-bank, four-byte word mapping, bank = word offset mod 32. Padding changes which banks a column touches. The eight-wide teaching tile makes the addresses easy to inspect.",
    ],
    predict: "For a full tile, which input location should thread (2, 0) write to out[0, 2]? Which thread in that block loaded the value?",
    exercise: "Compare the global and shared-memory traces. Follow thread (2, 0) and its shared-memory read. Set PADDING to 0 and compare the offsets of shared reads; the output values should still match.",
    explain: "Thread (2, 0) writes input[2, 0], loaded by thread (0, 2) in block (0, 0). The padding changes shared offsets while logical indices and result stay the same. Timing and bank conflicts should be investigated with a representative native tile and profiler.",
    native: "Run profile_workloads.py transpose. Compare direct and tiled kernels on rectangular inputs, including dimensions that do not divide the tile size. Use the native script's 32 × 8 block and 32 × 33 tile to compare against the eight-wide teaching example.",
    reference: "host['values'].T",
    cases: [caseOf("8 rows × 8 columns", transpose(8, 8, 8, 8)), caseOf("11 rows × 13 columns", transpose(11, 13, 8, 8))],
  },
  matmul: {
    title: "Reuse inputs in matrix multiplication",
    summary: "Build a tiled matrix product that reuses each global input across several threads.",
    concepts: ["Data reuse", "Partial tiles"],
    intro: [
      "Computing C[row, col] takes a dot product between one row of A and one column of B. Adjacent output cells can share inputs. This kernel loads a pair of tiles in parallel and lets each thread reuse them from shared memory.",
      "The loop advances through the inner dimension. The first barrier waits for loads, and the second keeps the next tile from overwriting data that some threads still need. Edge loads use zeros.",
    ],
    predict: "The first case has inner dimension six and a tile width of four. Which two inner coordinates are padding in the last tile?",
    exercise: "Run the rectangular case. Follow one thread across two tile phases and compare total global reads with total shared reads. Inspect the edge block to see which threads load padding but still reach the barriers.",
    explain: "The final tile covers indices four through seven. Coordinates six and seven contribute zero. Each thread must use both barriers even when its output position is outside the matrix.",
    native: "Build a direct implementation with two nested output coordinates and one inner dot-product loop. Benchmark both against the library result for large inputs and odd dimensions. Explain what the 4 × 4 tile does well enough to teach and what you would tune on hardware.",
    reference: "host['a'] @ host['b']",
    cases: [caseOf("5 × 6 times 6 × 7", matmul(5, 6, 7)), caseOf("4 × 4 times 4 × 4", matmul(4, 4, 4))],
  },
  softmax: {
    title: "Build a stable softmax",
    summary: "Combine block reductions, numerical stability, and PyTorch integration in a final kernel.",
    concepts: ["Numerical stability", "PyTorch interop"],
    intro: [
      "Softmax computes a probability for each input within a row. Direct exponentiation can overflow. Subtracting the row maximum keeps every exponential at or below one and leaves the mathematical probabilities unchanged.",
      "One block owns a row. Threads first reduce the maximum, then sum the shifted exponentials, then normalize their outputs. Threads with no element still participate using the neutral elements for each reduction.",
    ],
    predict: "For a row near 1,000, what does subtracting the row maximum do to the largest exponential? Which values should have the same probability?",
    exercise: "Run the extreme-value case and examine the row sums. Find the maximum and sum stages in the lane trace. Try removing the max shift, then restore it and test the 37-column case.",
    explain: "The largest shifted logit is zero, so its exponential is one. Equal logits within the same row get equal probabilities. Values separated by a very large gap can underflow to zero even after the stable shift.",
    native: "Run profile_workloads.py softmax with PyTorch. Verify ordinary and extreme inputs, compare CUDA event timings with torch.softmax, and record the shapes where the results differ most in speed. Explain the global reads and synchronization in this implementation.",
    reference: "(lambda exps: exps / exps.sum(axis=1, keepdims=True))(np.exp(host['values'] - host['values'].max(axis=1, keepdims=True)))",
    cases: [
      caseOf("Extreme and equal logits", softmax([[1000, 999, 1000, 997, -1000], [-1002, -1001, -1000, -1000, -1004]])),
      caseOf("Two rows · 37 columns", softmax([range(37).map((i) => i % 9 - 4), range(37).map((i) => 800 + i % 5)])),
    ],
  },
};
