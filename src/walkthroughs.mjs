// Retained narration for the retired first-value recording.
export const firstValueTranscript = [
  [
    "Create the CPU array",
    "This line creates out_host, a CPU array containing one zero."
  ],
  [
    "Copy the array to GPU memory",
    "cuda.to_device copies the array into GPU memory. The original stays on the CPU."
  ],
  [
    "Compile on the CPU, load onto the GPU",
    "Numba compiles this Python kernel on the CPU. CUDA loads the compiled code onto the GPU when needed."
  ],
  [
    "Launch one GPU thread",
    "One GPU thread runs the kernel. Its argument, out, is the array we just copied into GPU memory."
  ],
  [
    "Which array will change?",
    "Both arrays contain zero. Which array will change when this line runs?"
  ],
  [
    "Write to the GPU array",
    "The GPU thread writes 42 to the GPU array. The CPU array still holds zero."
  ],
  [
    "Copy the result to CPU memory",
    "Copy to host waits for the kernel to finish. It returns the value in a new CPU array called result."
  ]
];

export const walkthroughs = {
  "vector-add": {
    title: "Follow two threads through vector addition",
    stages: [
      {
        title: "Launch two blocks",
        rows: [{"label": "Block 0", "cells": ["0", "1", "…", "31"]}, {"label": "Block 1", "cells": ["0", "1", "…", "31"], "mark": [0, 1]}, {"label": "Inputs", "cells": ["0", "1", "…", "32"], "mark": [3]}],
        note: "Two blocks of 32 threads cover 33 elements.",
        highlight: "def kernel(a, b, out, n):",
        diagram: ["33 elements · n = 33", "kernel[2, 32](a, b, out, 33)", "2 blocks × 32 threads = 64 threads"],
        narration: "The host launches two blocks of thirty-two GPU threads. The arrays have thirty-three elements, so some threads have no element to write.",
        hold: 4,
      },
      {
        title: "Find each thread’s index",
        rows: [{"label": "Block 1", "cells": ["thread 0", "thread 1"]}, {"label": "Index i", "cells": ["32", "33"], "mark": [0, 1]}],
        note: "i = block × 32 + thread.",
        highlight: "i = cuda.grid(1)",
        diagram: ["i = block × 32 + thread", "Block 1, thread 0 → i = 32", "Block 1, thread 1 → i = 33"],
        narration: "Each thread calculates its global index. In block one, thread zero gets thirty-two. The next thread gets thirty-three.",
        hold: 4,
      },
      {
        title: "Predict which thread writes",
        rows: [{"label": "Thread", "cells": ["0", "1"]}, {"label": "Index i", "cells": ["32", "33"]}, {"label": "i < 33?", "cells": ["?", "?"], "mark": [0, 1]}],
        note: "Which thread enters the if block?",
        highlight: "if i < n:",
        diagram: ["n = 33", "Thread 0 → 32 < 33 ?", "Thread 1 → 33 < 33 ?"],
        narration: "The bounds check compares each index with thirty-three. Which of these two threads enters the if block?",
        hold: 8,
      },
      {
        title: "Only the valid index writes",
        rows: [{"label": "Thread 0", "cells": ["i = 32", "33 + 66", "out[32] = 99"], "mark": [2]}, {"label": "Thread 1", "cells": ["i = 33", "skips"]}],
        note: "The guard excludes the out-of-range thread.",
        highlight: "out[i] = a[i] + b[i]",
        diagram: ["Thread 0 → out[32] = 33 + 66 = 99", "Thread 1 → i = 33, so it skips", "The CPU copies the result back."],
        narration: "Thread zero writes ninety-nine at index thirty-two. Thread one skips the assignment because index thirty-three is outside the arrays.",
        hold: 4,
      },
    ],
  },
  "grid-stride": {
    title: "Follow one thread through a grid-stride loop",
    stages: [
      {
        title: "Start with a global index",
        rows: [{"label": "Thread", "cells": ["Block 0", "thread 3"], "mark": [1]}, {"label": "First", "cells": ["3"], "mark": [0]}],
        note: "Two blocks × eight threads = sixteen threads.",
        highlight: "first = cuda.grid(1)",
        diagram: ["35 elements · n = 35", "2 blocks × 8 threads = 16 threads", "Block 0, thread 3 → first = 3"],
        narration: "The host launches sixteen threads for thirty-five elements. Block zero, thread three starts at global index three.",
        hold: 4,
      },
      {
        title: "Calculate the stride",
        rows: [{"label": "Blocks", "cells": ["2"]}, {"label": "Threads", "cells": ["8 per block"]}, {"label": "Stride", "cells": ["2 × 8 = 16"], "mark": [0]}],
        note: "The stride is the total number of threads.",
        highlight: "stride = cuda.gridDim.x * cuda.blockDim.x",
        diagram: ["2 blocks × 8 threads = 16", "stride = 16", "Next index = current index + 16"],
        narration: "The stride equals the total number of threads. Here, two blocks times eight threads gives a stride of sixteen.",
        hold: 4,
      },
      {
        title: "Predict this thread’s indices",
        rows: [{"label": "Thread 3", "cells": ["3", "19", "?"], "mark": [2]}, {"label": "Limit", "cells": ["n = 35"]}],
        note: "Add 16 at each step; stop before 35.",
        highlight: "for i in range(first, n, stride):",
        diagram: ["first = 3 · n = 35 · stride = 16", "3 → 19 → ?", "The loop stops before 35."],
        narration: "Starting at three, add sixteen for each visit. Which indices will this thread process before it reaches thirty-five?",
        hold: 8,
      },
      {
        title: "Visit two array elements",
        rows: [{"label": "Thread 3", "cells": ["3", "19", "35"], "mark": [0, 1]}, {"label": "Action", "cells": ["write", "write", "stop"]}],
        note: "The loop visits 3 and 19; 35 is outside the range.",
        highlight: "out[i] = values[i] * 2",
        diagram: ["3 → 19 → 35 stops", "Thread 3 writes out[3] and out[19]", "Each output is twice its input."],
        narration: "The thread visits indices three and nineteen. Thirty-five is outside the loop, so it stops. At each visit, the thread doubles the input into the output.",
        hold: 4,
      },
    ],
  },
  transfers: {
    title: "Follow arrays between CPU and GPU",
    stages: [
      {
        title: "Copy the inputs to GPU memory",
        phase: "inputs",
        lines: ["x = cuda.to_device(x_host)", "y = cuda.to_device(y_host)"],
        note: "33 float32 elements per input · 4 bytes each",
        narration: "The host copies the two input arrays to GPU memory. Each array contains thirty-three float thirty-two values, and each value occupies four bytes.",
        hold: 4,
      },
      {
        title: "Allocate and run on the GPU",
        phase: "compute",
        lines: ["out = cuda.device_array(33, dtype=np.float32)", "out[i] = alpha * x[i] + y[i]"],
        note: "GPU threads read x and y, then write out.",
        narration: "The host allocates the output on the GPU. Each active GPU thread reads one value from each input and writes one output.",
        hold: 4,
      },
      {
        title: "Predict the bytes transferred",
        lines: ["result = out.copy_to_host()"],
        note: "Two arrays go to the GPU; one returns. How many bytes cross?",
        narration: "The result comes back to the CPU. Two arrays went to the GPU, and one returns. How many bytes cross between them?",
        hold: 8,
      },
      {
        title: "Count the three copies",
        lines: ["x = cuda.to_device(x_host)", "y = cuda.to_device(y_host)", "result = out.copy_to_host()"],
        note: "33 × 4 = 132 bytes per array · 3 × 132 = 396 bytes",
        narration: "Each copy moves one hundred thirty-two bytes. Together, the three copies move three hundred ninety-six bytes.",
        hold: 4,
      },
    ],
  },
  divergence: {
    title: "Follow branches across a warp",
    stages: [
      {
        title: "Alternating signs split each warp",
        sceneKind: "warp", grouped: false, highlight: "if x < 0:",
        note: "Each colored lane represents one thread. Negative inputs take the if path.",
        narration: "Each block contains one warp of thirty-two threads. With alternating signs, neighboring lanes take different paths through the kernel.",
        hold: 4,
      },
      {
        title: "Predict the negative lanes",
        sceneKind: "warp", grouped: false, highlight: "if x < 0:",
        note: "In Block 0, how many lanes take the negative path?",
        narration: "Look at block zero. How many lanes will take the negative path?",
        hold: 8,
      },
      {
        title: "Sixteen lanes take each path",
        sceneKind: "warp", grouped: false, highlight: "out[i] = x * 0.25",
        note: "Each block has 16 negative lanes and 16 positive lanes.",
        narration: "Sixteen lanes take the negative path and sixteen take the other path. Both warps contain a mixture of paths.",
        hold: 4,
      },
      {
        title: "Group the signs",
        sceneKind: "warp", grouped: true, highlight: "if x < 0:",
        note: "Block 0 has 32 negative lanes; Block 1 has 32 positive lanes.",
        narration: "In the grouped case, the first warp has only negative inputs and the second has only positive inputs. Timing depends on the compiled instructions and work on each path.",
        hold: 4,
      },
    ],
  },
  histogram: {
    title: "Follow threads updating a histogram",
    stages: [
      {
        title: "Each token selects a counter",
        sceneKind: "counters", count: "0", highlight: "cuda.atomic.add(counts, tokens[i], 1)",
        note: "All 32 tokens select counter 2. Each thread atomically adds one.",
        narration: "Each thread reads a token and atomically increments its selected counter. In this case all thirty-two tokens select counter two.",
        hold: 4,
      },
      {
        title: "Predict the final count",
        sceneKind: "counters", count: "?", highlight: "cuda.atomic.add(counts, tokens[i], 1)",
        note: "All counters start at zero. What will counter 2 contain?",
        narration: "All counters start at zero. What will counter two contain after all thirty-two updates?",
        hold: 8,
      },
      {
        title: "Atomic updates count every token",
        sceneKind: "counters", count: "32", highlight: "cuda.atomic.add(counts, tokens[i], 1)",
        note: "Every atomic update contributes one to counter 2.",
        narration: "Counter two contains thirty-two. Every atomic update is counted.",
        hold: 4,
      },
      {
        title: "Why an ordinary increment can lose a count",
        sceneKind: "race", highlight: "cuda.atomic.add(counts, tokens[i], 1)",
        note: "If two threads read the same old value, both can store 1.",
        narration: "With an ordinary increment, two threads could both read zero and both write one. Two increments would leave a count of one.",
        hold: 4,
      },
    ],
  },
  scan: {
    title: "Follow one lane through a shared scan",
    stages: [
      {
        title: "Load the keep flags",
        phase: "scan", highlight: "scratch[lane] = values[lane] if lane < n else 0",
        slots: [1,0,1,1,0,0,1,0], slotHighlights: [6],
        note: "Lane 6 begins with 1. Slot 7 is zero padding.",
        narration: "The block loads the seven keep flags into shared memory. Lane six begins with one, and the extra slot contains zero.",
        hold: 4,
      },
      {
        title: "Predict the last running total",
        phase: "scan", highlight: "previous = scratch[lane - distance] if lane >= distance else 0",
        slots: [1,0,1,1,0,0,1,0], slotHighlights: [6],
        note: "Lane 6 will read distances 1, 2, and 4. What total will it produce?",
        narration: "Lane six reads from distances one, two, and four over successive stages. What running total will it produce?",
        hold: 8,
      },
      {
        title: "Wait between reads and writes",
        phase: "scan", highlight: "cuda.syncthreads()",
        slots: [1,0,1,1,0,0,1,0], slotHighlights: [6],
        note: "One barrier finishes the reads; another finishes the writes.",
        narration: "Each stage uses barriers to separate reads from writes, so every lane reads values from the previous stage.",
        hold: 4,
      },
      {
        title: "Find the kept item’s position",
        phase: "scan", highlight: "out[lane] = scratch[lane]",
        slots: [1,1,2,3,3,3,4,4], slotHighlights: [6],
        note: "out[6] = 4 · destination = 4 − 1 = 3.",
        narration: "The inclusive total at index six is four. Since destinations start at zero, the final kept item goes to position three.",
        hold: 4,
      },
    ],
  },
  "sync-debug": {
    title: "Follow the edge thread to the barrier",
    stages: [
      {
        title: "Fill all four shared slots",
        phase: "sync", highlight: "slot[lane] = i if i < n else -1",
        memoryLabel: "Block 1 · shared slots", slots: [4,5,6,-1], slotHighlights: [3],
        note: "Thread 3 has index 7, outside the seven-output case, and stores −1.",
        narration: "Block one has four threads. Thread three is outside the seven-output array, so it stores minus one in its shared slot.",
        hold: 4,
      },
      {
        title: "Predict the boundary read",
        phase: "sync", highlight: "out[i] = slot[(lane + 1) % 4]",
        memoryLabel: "Block 1 · shared slots", slots: [4,5,6,-1], slotHighlights: [2,3],
        note: "Thread 2 writes out[6] using the next slot. What value does it read?",
        narration: "Thread two writes output six using the next slot. What value does it read?",
        speech: "Thread two writes output six using the next slot. [pause 0.6] What value does it read?",
        hold: 8,
      },
      {
        title: "Keep the edge thread at the barrier",
        phase: "sync", highlight: "cuda.syncthreads()",
        memoryLabel: "Block 1 · shared slots", slots: [4,5,6,-1], slotHighlights: [3],
        note: "Thread 2 reads slot[3] = −1. Thread 3 must reach the barrier.",
        narration: "Thread two reads minus one from thread three. If thread three returned early, it would skip the shared write and the required block barrier.",
        hold: 4,
      },
    ],
  },
  "tiled-transpose": {
    title: "Trace tiled transpose on the GPU",
    stages: [
      {"title": "Load the shared tile", "highlight": "tile[ty, tx] = values[row, col]", "rows": [{"label": "Thread", "cells": ["(0, 2)"], "mark": [0]}, {"label": "Loads", "cells": ["values[2, 0]"], "mark": [0]}, {"label": "Shared", "cells": ["tile[2, 0]"], "mark": [0]}], "note": "Block (0, 0) · the barrier makes the tile ready.", "narration": "Thread zero, two loads input row two, column zero into the shared tile. The block barrier makes that tile ready.", "hold": 4},
      {"title": "Predict who writes it", "highlight": "out[out_row, out_col] = tile[tx, ty]", "rows": [{"label": "Shared", "cells": ["tile[2, 0]"], "mark": [0]}, {"label": "Thread", "cells": ["(2, 0)"], "mark": [0]}, {"label": "Output", "cells": ["out[0, 2]"], "mark": [0]}], "note": "Thread (2, 0) reads tile[2, 0]. Who loaded it?", "narration": "Thread two, zero reads shared tile at two, zero. Which thread loaded that position?", "hold": 8},
      {"title": "The tile swaps coordinates", "highlight": "out[out_row, out_col] = tile[tx, ty]", "rows": [{"label": "Loader", "cells": ["(0, 2)"], "mark": [0]}, {"label": "Shared", "cells": ["tile[2, 0]"], "mark": [0]}, {"label": "Writer", "cells": ["(2, 0)"], "mark": [0]}], "note": "values[2, 0] becomes out[0, 2].", "narration": "Thread zero, two loaded it. Thread two, zero writes that value into output row zero, column two.", "hold": 4},
    ],
  },
  "matmul": {
    title: "Trace matmul on the GPU",
    stages: [
      {"title": "Load a pair of tiles", "highlight": "tile_a[ty, tx] = a[row, a_col] if row < m and a_col < k else 0", "rows": [{"label": "Pass 1", "cells": ["0", "1", "2", "3"], "mark": []}, {"label": "Pass 2", "cells": ["4", "5", "6", "7"], "mark": [2, 3]}], "note": "5 × 6 times 6 × 7 · inner dimension k = 6.", "narration": "The block stages four inner positions per pass in shared memory. The second pass covers positions four through seven.", "hold": 4},
      {"title": "Predict the padded positions", "highlight": "for start in range(0, k, TILE):", "rows": [{"label": "Pass 2", "cells": ["4", "5", "6", "7"], "mark": []}, {"label": "Valid", "cells": ["0", "1", "2", "3", "4", "5"], "mark": []}], "note": "Which positions in the second pass fall outside k = 6?", "narration": "The inner dimension contains six positions, zero through five. Which positions in the second pass are outside the input?", "hold": 8},
      {"title": "Fill the tail with zero", "highlight": "tile_b[ty, tx] = b[b_row, col] if b_row < k and col < n else 0", "rows": [{"label": "Pass 2", "cells": ["4", "5", "6", "7"], "mark": [2, 3]}, {"label": "Loaded", "cells": ["valid", "valid", "0", "0"], "mark": [2, 3]}], "note": "All threads participate in the tile barriers.", "narration": "Positions six and seven load zero. Threads still reach the barriers that make the shared tiles ready and protect their reuse.", "hold": 4},
    ],
  },
  "softmax": {
    title: "Trace softmax on the GPU",
    stages: [
      {"title": "Find the row maximum", "highlight": "row_max = scratch[0]", "rows": [{"label": "Scores", "cells": ["1000", "999", "1000", "997", "−1000"], "mark": [0, 2]}, {"label": "Maximum", "cells": ["1000"], "mark": [0]}], "note": "One block finds the maximum for the row.", "narration": "One block finds the largest score in the row. Here, that maximum is one thousand.", "hold": 4},
      {"title": "Predict matching probabilities", "highlight": "out[row, col] = math.exp(values[row, col] - row_max) / scratch[0]", "rows": [{"label": "Scores", "cells": ["1000", "999", "1000", "997", "−1000"], "mark": [0, 2]}, {"label": "Shifted", "cells": ["0", "−1", "0", "−3", "−2000"], "mark": [0, 2]}], "note": "Which columns receive equal probabilities?", "narration": "Subtracting the maximum gives zero for columns zero and two. Which columns will have equal probabilities?", "hold": 8},
      {"title": "Normalize the shifted scores", "highlight": "out[row, col] = math.exp(values[row, col] - row_max) / scratch[0]", "rows": [{"label": "Shifted", "cells": ["0", "−1", "0", "−3", "−2000"], "mark": [0, 2]}, {"label": "exp", "cells": ["1", "exp(−1)", "1", "exp(−3)", "≈0"], "mark": [0, 2]}], "note": "Divide each exponential by their shared sum.", "narration": "The two zero shifts have the same exponential, one. Dividing by the shared row sum gives those columns equal probabilities.", "hold": 4},
    ],
  },
  "gather": {
    title: "Trace gather on the GPU",
    stages: [
      {"title": "Follow one indirect read", "highlight": "out[i] = values[indices[i]]", "rows": [{"label": "indices", "cells": ["0", "8", "16", "24", "32", "40", "48", "56"], "mark": [1]}, {"label": "values", "cells": ["100", "…", "108", "…", "116", "…"], "mark": [2]}, {"label": "out", "cells": ["100", "108", "…"], "mark": [1]}], "note": "Thread 1 reads indices[1] = 8, then values[8] = 108.", "narration": "Thread one reads index eight from the index array, then fetches value one hundred eight from that position.", "hold": 4},
      {"title": "Predict the sectors", "highlight": "out[i] = values[indices[i]]", "rows": [{"label": "indices", "cells": ["0", "8", "16", "24", "32", "40", "48", "56"], "mark": []}, {"label": "Sector", "cells": ["?", "?", "?", "?", "?", "?", "?", "?"], "mark": []}], "note": "Each aligned 32-byte sector holds eight four-byte values.", "narration": "The indices are eight elements apart. How many aligned thirty-two byte sectors do their value reads touch?", "hold": 8},
      {"title": "Map indices to sectors", "highlight": "out[i] = values[indices[i]]", "rows": [{"label": "indices", "cells": ["0", "8", "16", "24", "32", "40", "48", "56"], "mark": []}, {"label": "Sector", "cells": ["0", "1", "2", "3", "4", "5", "6", "7"], "mark": [0, 1, 2, 3, 4, 5, 6, 7]}], "note": "Value reads touch 8 sectors; index reads touch 1.", "narration": "Each value lies in a different sector. The eight consecutive index reads touch one sector, under the same alignment assumption.", "hold": 4},
    ],
  },
  "stencil": {
    title: "Trace stencil on the GPU",
    stages: [
      {"title": "Load the center and halo", "highlight": "tile[lane + 1] = values[i] if i < n else 0.0", "rows": [{"label": "Input", "cells": ["8", "9", "10"], "mark": [0]}, {"label": "Index", "cells": ["7", "8", "9"], "mark": []}, {"label": "Block 1", "cells": ["halo", "lane 0", "lane 1"], "mark": [0]}], "note": "The first thread loads a left halo from the preceding block.", "narration": "Block one starts at index eight. Its first thread also loads the neighbor at index seven into the left halo.", "hold": 4},
      {"title": "Predict the boundary output", "highlight": "out[i] = tile[lane] + tile[lane + 1] + tile[lane + 2]", "rows": [{"label": "Input", "cells": ["8", "9", "10"], "mark": []}, {"label": "Index", "cells": ["7", "8", "9"], "mark": []}, {"label": "out[8]", "cells": ["?"], "mark": []}], "note": "What sum does the first output of Block 1 receive?", "narration": "The first output of block one adds these three inputs. What value will it receive?", "hold": 8},
      {"title": "Read the ready tile", "highlight": "out[i] = tile[lane] + tile[lane + 1] + tile[lane + 2]", "rows": [{"label": "Input", "cells": ["8", "9", "10"], "mark": []}, {"label": "out[8]", "cells": ["27"], "mark": [0]}], "note": "The barrier precedes these shared-memory reads.", "narration": "The thread adds eight, nine, and ten to write twenty-seven. The block barrier makes the shared tile ready before the read.", "hold": 4},
    ],
  },
  "precision": {
    title: "Trace precision on the GPU",
    stages: [
      {"title": "Round the first addition", "highlight": "first = float32(a[i] + b[i])", "rows": [{"label": "a", "cells": ["16,777,216"], "mark": []}, {"label": "b", "cells": ["1"], "mark": []}, {"label": "Rounded", "cells": ["16,777,216"], "mark": [0]}], "note": "At this magnitude, float32 rounds a + b back to a.", "narration": "The thread adds one to sixteen million seven hundred seventy-seven thousand two hundred sixteen. Float thirty two rounds the sum back to the original value.", "hold": 4},
      {"title": "Predict the final sum", "highlight": "out[i] = float32(first + c[i])", "rows": [{"label": "first", "cells": ["16,777,216"], "mark": []}, {"label": "c", "cells": ["−16,777,216"], "mark": []}, {"label": "out", "cells": ["?"], "mark": []}], "note": "What happens to the 1 after the subtraction?", "narration": "The thread then adds the negative of the original value. What happens to the one?", "speech": "The thread then adds the negative of the original value. [pause 0.6] What happens to the one?", "hold": 8},
      {"title": "Compare the grouping", "highlight": "out[i] = float32(first + c[i])", "rows": [{"label": "(a+b)+c", "cells": ["0"], "mark": [0]}, {"label": "(a+c)+b", "cells": ["1"], "mark": [0]}], "note": "Each addition rounds to float32.", "narration": "The starter grouping returns zero because the one was rounded away. Canceling the large positive and negative values first gives one.", "hold": 4},
    ],
  },
  "fusion": {
    title: "Trace fusion on the GPU",
    stages: [
      {"title": "Compute a local value", "highlight": "value = float32(alpha * x[i] + y[i])", "rows": [{"label": "Inputs", "cells": ["x[i]", "y[i]"], "mark": []}, {"label": "Local", "cells": ["value"], "mark": [0]}], "note": "One thread reads x and y and computes a local value.", "narration": "Each thread reads one x and one y value from GPU memory and computes a local intermediate.", "hold": 4},
      {"title": "Predict the saved accesses", "highlight": "temp[i] = value", "rows": [{"label": "Store path", "cells": ["write temp", "read temp"], "mark": []}, {"label": "Local path", "cells": ["keep value"], "mark": []}, {"label": "8 threads", "cells": ["?"], "mark": []}], "note": "How many temporary reads and writes disappear?", "narration": "The temporary path writes the intermediate and reads it back. How many temporary reads and writes disappear for eight threads?", "hold": 8},
      {"title": "Remove the temporary traffic", "highlight": "value = temp[i]", "rows": [{"label": "Removed", "cells": ["8 writes", "8 reads"], "mark": [0, 1]}, {"label": "Remaining", "cells": ["read x", "read y", "write out"], "mark": []}], "note": "Source-level count · compiler and caches affect measured traffic.", "narration": "Keeping the value local removes eight temporary writes and eight temporary reads in this source-level count. Compiler and cache behavior affect measured traffic.", "hold": 4},
    ],
  },
  coalescing: {
    title: "Follow a warp’s addresses into memory sectors",
    stages: [
      {
        title: "Eight lanes read adjacent values",
        mode: "read",
        note: "Aligned 32-byte sector · each numbered cell is a four-byte word offset.",
        narration: "In the eight by thirty-two case, the first eight lanes read consecutive values. With four bytes per value, offsets zero through seven fit in one aligned thirty-two byte sector.",
        hold: 4,
      },
      {
        title: "Predict the transposed writes",
        mode: "read",
        note: "The assignment writes out[col, row]. Where do the same lanes write?",
        narration: "The assignment swaps row and column in the output. Will those same lanes store into one sector or several?",
        hold: 8,
      },
      {
        title: "Eight lanes write eight sectors",
        mode: "write",
        note: "Output word offsets 0, 8, …, 56 land in separate aligned 32-byte sectors.",
        narration: "After the transpose, adjacent lanes write eight words apart. Their offsets are zero, eight, and so on, through fifty-six. Each falls in a different aligned sector.",
        hold: 4,
      },
      {
        title: "Read the calculation as a model",
        mode: "write",
        note: "Across all 32 lanes · 4 read sectors, 32 write sectors. Measure actual GPU traffic.",
        narration: "Across all thirty-two lanes, the address calculation covers four read sectors and thirty-two write sectors. Actual traffic also depends on the compiled instructions and caches.",
        hold: 4,
      },
    ],
  },
  reduction: {
    title: "Follow a shared-memory reduction",
    stages: [
      {
        title: "Load values into shared memory",
        phase: "start",
        highlight: "scratch[lane] = values[i] if i < n else 0.0",
        note: "Eight threads load values 1–8 into one block’s shared scratch array.",
        narration: "In block zero, eight threads copy the values one through eight into shared memory. Each slot belongs to one thread during this first load.",
        hold: 4,
      },
      {
        title: "Wait for the shared writes",
        phase: "before",
        highlight: "cuda.syncthreads()",
        note: "Thread 1 needs scratch[5]. Every thread reaches the barrier before the read.",
        narration: "All threads reach the barrier. Thread one then reads the six stored by thread five.",
        hold: 4,
      },
      {
        title: "Predict the first addition",
        phase: "before",
        highlight: "scratch[lane] += scratch[lane + distance]",
        note: "Distance 4 · thread 1 reads slots 1 and 5. What will slot 1 contain?",
        narration: "At distance four, thread one adds the value in slot five to its own slot. What will slot one contain?",
        hold: 8,
      },
      {
        title: "Thread 1 stores the sum",
        phase: "after",
        highlight: "scratch[lane] += scratch[lane + distance]",
        note: "2 + 6 = 8 · another barrier completes the stage before distance changes.",
        narration: "Thread one adds two and six and stores eight. The other active threads update their slots too. A barrier completes the stage before the next distance.",
        hold: 4,
      },
    ],
  },

};
