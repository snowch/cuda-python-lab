export const walkthroughs = {
  "first-value": {
    title: "Follow one value from CPU to GPU and back",
    stages: [
      {
        title: "Create the CPU array",
        hold: 4,
        trace: {
          code: "out_host = np.zeros(1, dtype=np.float32)",
          focus: "host",
        },
        narration: "This line creates out_host, a CPU array containing one zero.",
        speech: "This line creates out host, a CPU array containing one zero.",
      },
      {
        title: "Copy the array to GPU memory",
        hold: 4,
        trace: {
          code: "out = cuda.to_device(out_host)",
          device: "out = [0]", arrow: "Copy ↓", focus: "device",
        },
        narration: "cuda.to_device copies the array into GPU memory. The original stays on the CPU.",
        speech: "[CUDA](/kˈuːdə/) dot to device copies the array into GPU memory. [pause 0.55] The original stays on the CPU.",
      },
      {
        title: "Compile on the CPU, load onto the GPU",
        hold: 4.5,
        trace: {
          before: "@cuda.jit",
          code: "def kernel(out):",
          device: "out = [0]", arrow: "Load ↓", activity: "Compiled kernel", focus: "activity",
        },
        narration: "Numba compiles this Python kernel on the CPU. CUDA loads the compiled code onto the GPU when needed.",
        speech: "[Numba](/nˈʌmbə/) compiles this Python kernel on the CPU. [pause 0.55] [CUDA](/kˈuːdə/) loads the compiled code onto the GPU when needed.",
      },
      {
        title: "Launch one GPU thread",
        hold: 4.5,
        trace: {
          code: "kernel[1, 1](out)",
          device: "out = [0]", arrow: "Launch ↓", activity: "One GPU thread", focus: "activity",
        },
        narration: "One GPU thread runs the kernel. Its argument, out, is the array we just copied into GPU memory.",
      },
      {
        title: "Which array will change?",
        hold: 8,
        trace: {
          code: "out[0] = 42",
          device: "out = [0]", activity: "One GPU thread",
        },
        narration: "Both arrays contain zero. Which array will change when this line runs?",
        speech: "Both arrays contain zero. [pause 0.55] Which array will change when this line runs?",
      },
      {
        title: "Write to the GPU array",
        hold: 4,
        trace: {
          code: "out[0] = 42",
          device: "out = [42]", activity: "One GPU thread", focus: "device",
        },
        narration: "The GPU thread writes 42 to the GPU array. The CPU array still holds zero.",
        speech: "The GPU thread writes 42 to the GPU array. [pause 0.55] The CPU array still holds zero.",
      },
      {
        title: "Copy the result to CPU memory",
        hold: 4.5,
        trace: {
          code: "result = out.copy_to_host()",
          device: "out = [42]", arrow: "Copy ↑", result: "result = [42]", focus: "result",
        },
        narration: "Copy to host waits for the kernel to finish. It returns the value in a new CPU array called result.",
      },
    ],
  },
  "vector-add": {
    title: "Follow two threads through vector addition",
    stages: [
      {
        title: "Launch two blocks",
        highlight: "def kernel(a, b, out, n):",
        diagram: ["33 elements · n = 33", "kernel[2, 32](a, b, out, 33)", "2 blocks × 32 threads = 64 threads"],
        narration: "The host launches two blocks of thirty-two GPU threads. The arrays have thirty-three elements, so some threads have no element to write.",
        hold: 4,
      },
      {
        title: "Find each thread’s index",
        highlight: "i = cuda.grid(1)",
        diagram: ["i = block × 32 + thread", "Block 1, thread 0 → i = 32", "Block 1, thread 1 → i = 33"],
        narration: "Each thread calculates its global index. In block one, thread zero gets thirty-two. The next thread gets thirty-three.",
        hold: 4,
      },
      {
        title: "Predict which thread writes",
        highlight: "if i < n:",
        diagram: ["n = 33", "Thread 0 → 32 < 33 ?", "Thread 1 → 33 < 33 ?"],
        narration: "The bounds check compares each index with thirty-three. Which of these two threads enters the if block?",
        hold: 8,
      },
      {
        title: "Only the valid index writes",
        highlight: "out[i] = a[i] + b[i]",
        diagram: ["Thread 0 → out[32] = 33 + 66 = 99", "Thread 1 → i = 33, so it skips", "The CPU copies the result back."],
        narration: "Thread zero writes ninety-nine at index thirty-two. Thread one skips the assignment because index thirty-three is outside the arrays.",
        hold: 4,
      },
    ],
  },
  coalescing: {
    title: "See how a warp groups memory addresses",
    stages: [
      {
        title: "Find a lane inside a warp",
        diagram: ["GPU chip → SM → Block (0, 0)", "Warp · 32 threads in this block", "Lane · a thread’s position within the warp"],
        narration: "An S M executes the threads in a block in groups called warps. In the eight rows by thirty-two columns case, the block has one warp. Each lane identifies one thread in that warp.",
      },
      {
        title: "Read consecutive columns",
        diagram: ["values[row, col] · fixed row, changing column", "First 8 lanes → word offsets [0, 1, …, 7]", "1 sector of 32 bytes"],
        narration: "A word offset counts four byte values from the start of the array. The first eight lanes read consecutive columns. Their eight values fit in one thirty-two byte sector.",
      },
      {
        title: "Write to separate rows",
        diagram: ["out[col, row] · changing row, fixed column", "First 8 lanes → word offsets [0, 8, …, 56]", "8 distinct sectors"],
        narration: "The transpose swaps row and column. In the output, these lanes write eight words apart. The same eight lanes now touch eight distinct sectors.",
      },
      {
        title: "Count sectors for the whole warp",
        diagram: ["Address calculation · Distinct sectors", "32 reads → 4 sectors", "32 writes → 32 sectors"],
        narration: "Across all lanes, the addresses cover four read sectors and thirty-two write sectors. The calculation groups addresses. Measured GPU traffic also depends on caches and the instructions the hardware runs.",
      },
    ],
  },
  reduction: {
    title: "Follow a value through shared memory and a barrier",
    stages: [
      {
        title: "Copy input values into shared memory",
        diagram: ["Global memory · values[0:8]", "Block 0 · Threads 0–7", "Block 0 shared memory · scratch = [1, 2, 3, 4, 5, 6, 7, 8]"],
        narration: "For sixteen values and eight threads per block, each thread in block zero copies one value into scratch. Scratch is shared memory that the threads in the same block can access.",
      },
      {
        title: "Wait for the first writes",
        diagram: ["Thread 1 stores 2 in scratch[1]", "Thread 5 stores 6 in scratch[5]", "cuda.syncthreads() → all threads in the block wait"],
        narration: "Thread one stores two, while thread five stores six. Each must reach the block barrier before any thread continues. The barrier lets thread one read the value written by thread five.",
      },
      {
        title: "Add values four positions apart",
        diagram: ["Thread 1 reads scratch[5] = 6", "Thread 1 writes 2 + 6 = 8 to scratch[1]", "Next barrier → wait before the next distance"],
        narration: "At a distance of four, thread one reads scratch at index five and adds six to its two. The notebook experiment prints those two inputs from inside the kernel.",
      },
      {
        title: "Follow the partial block",
        diagram: ["Case · 19 values, 8 threads per block", "Block 2 · [17, 18, 19, 0, 0, 0, 0, 0]", "out[2] = 54"],
        narration: "In the nineteen value case, the last block starts with three inputs and five zeros. All eight threads reach the barrier. Compare the sum of those three inputs with the last output printed by main.",
      },
    ],
  },
};
