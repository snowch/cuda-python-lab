export const walkthroughs = {
  "first-value": {
    title: "Follow one value from the CPU to the GPU and back",
    stages: [
      {
        title: "Prepare a separate GPU array",
        diagram: ["CPU memory · out_host = [0]", "Copy → cuda.to_device(out_host)", "GPU memory · out = [0]"],
        narration: "Main runs on the CPU. It starts with a one element NumPy array containing zero. To device copies that value into a separate array in GPU memory.",
      },
      {
        title: "Launch one thread",
        diagram: ["CPU · kernel[1, 1](out)", "Launch → 1 block × 1 thread", "GPU compute chip · streaming multiprocessor (SM)"],
        narration: "The first one in the square brackets requests one block. The second one requests one thread per block. A streaming multiprocessor, or S M, is a part of the GPU chip that executes the thread.",
      },
      {
        title: "Write to GPU memory",
        diagram: ["SM · out[0] = 42", "GPU memory · out = [42]", "CPU memory · out_host = [0]"],
        narration: "The thread writes forty-two to the GPU array. The original CPU array still contains zero. Which line makes the new value available on the CPU?",
      },
      {
        title: "Copy back and print",
        diagram: ["GPU memory · out = [42]", "Copy → out.copy_to_host()", "CPU memory · result = [42]", "print → out = [42.0]"],
        narration: "Copy to host waits for the result and returns a CPU array. Main can now print forty-two. Change the assignment to seventy-three and trace the same steps with the new value.",
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
