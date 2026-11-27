export const walkthroughs = {
  "first-value": {
    title: "Follow one value from CPU to GPU and back",
    stages: [
      {
        title: "Copy zero to GPU memory",
        hold: 2.5,
        trace: {
          before: "out_host = np.zeros(1, dtype=np.float32)",
          code: "out = cuda.to_device(out_host)",
          device: "out = [0]", arrow: "Copy ↓", focus: "device",
        },
        narration: "The first highlighted line creates a CPU array with one zero. The next line calls cuda.to_device to copy it into GPU memory.",
        speech: "The first highlighted line creates a CPU array with one zero. [pause 0.55] The next line calls [CUDA](/kˈuːdə/) dot to device to copy it into GPU memory.",
      },
      {
        title: "Compile on the CPU, load onto the GPU",
        hold: 3,
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
        hold: 3,
        trace: {
          code: "kernel[1, 1](out)",
          device: "out = [0]", arrow: "Launch ↓", activity: "One GPU thread", focus: "activity",
        },
        narration: "One GPU thread runs the kernel. Its argument, out, is the array we just copied into GPU memory.",
      },
      {
        title: "Which array will change?",
        hold: 6,
        trace: {
          code: "out[0] = 42",
          device: "out = [0]", activity: "One GPU thread",
        },
        narration: "Both arrays contain zero. Which array will change when this line runs?",
        speech: "Both arrays contain zero. [pause 0.55] Which array will change when this line runs?",
      },
      {
        title: "Write to the GPU array",
        hold: 2.5,
        trace: {
          code: "out[0] = 42",
          device: "out = [42]", activity: "One GPU thread", focus: "device",
        },
        narration: "The GPU thread writes 42 to the GPU array. The CPU array still holds zero.",
        speech: "The GPU thread writes 42 to the GPU array. [pause 0.55] The CPU array still holds zero.",
      },
      {
        title: "Copy the result to CPU memory",
        hold: 3.5,
        trace: {
          code: "result = out.copy_to_host()",
          device: "out = [42]", arrow: "Copy ↑", result: "result = [42]", focus: "result",
        },
        narration: "Copy to host waits for the kernel to finish. It returns the value in a new CPU array called result.",
      },
    ],
  },
  "vector-add": {
    title: "Map CUDA blocks and threads to array indices",
    stages: [
      {
        title: "Start enough whole blocks",
        diagram: ["Case · 33 elements", "kernel[2, 32](a, b, out, 33)", "2 blocks × 32 threads = 64 threads"],
        narration: "With thirty-three elements and thirty-two threads per block, main launches two blocks. Each thread needs to work out which array index belongs to it.",
      },
      {
        title: "Compute the global index",
        diagram: ["i = cuda.grid(1)", "i = block number × threads per block + thread number", "Block 1, Thread 0 → 1 × 32 + 0 = 32"],
        narration: "CUDA grid of one returns the index across all blocks. Multiply the block number by the threads per block and add the thread number. Block one, thread zero gets index thirty-two.",
        speech: "[CUDA](/kˈuːdə/) grid of one returns the index across all blocks. Multiply the block number by the threads per block and add the thread number. Block one, thread zero gets index thirty-two.",
      },
      {
        title: "Skip indices outside the array",
        diagram: ["i < n, where n = 33", "Block 1, Thread 0 · i = 32 → write out[32]", "Block 1, Thread 1 · i = 33 → skip"],
        narration: "Index thirty-two is the last valid position. The next thread gets thirty-three and skips the reads and write. Put both indices into the kernel's bounds check to see which thread enters the if block.",
      },
      {
        title: "Change the size of a block",
        diagram: ["32 threads per block → Block 1, Thread 0", "16 threads per block → Block 2, Thread 0", "Both write out[32]"],
        narration: "In main, change the launch to three blocks of sixteen threads each. Block two, thread zero writes the same array position. The diagnostic print in the notebook shows that thread's block and thread numbers.",
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
