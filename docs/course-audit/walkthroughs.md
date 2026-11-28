# Walkthrough review

Each stage below links to a sheet of decoded frames. Times delimit the spoken captions for that stage. The sampled frame is 0.2 s after the first cue begins. The rest of the stage includes a reading or prediction hold. All 63 concatenated stage captions matched the canonical narration text. The full duration, stream formats and MP4 checksums are in [the manifest](evidence/manifest.json). Chromium playback status and dropped-frame counts are in [the playback ledger](evidence/playback.jsonl).

The full AAC tracks were decoded to mono PCM and screened with faster-whisper small.en on CPU. The recognizer recovered the teaching sequence, values and terminal explanations across all 17 tracks. It rendered “waits” as “weights” in first-value and produced an extra phrase around the prediction pause in precision. These are listening-review flags. An audio presentation attempt returned “audio content omitted because you do not support audio input”. Pronunciation, accent, unnatural pauses and perceived loudness need a listener. [Machine transcripts](evidence/speech.jsonl)

The side-by-side source and data region uses the upper part of the frame with space below for captions. Inline phone videos retain the whole slide; showing a complete kernel at this scale shrinks identifiers substantially. Provide untimed stage navigation and responsive HTML code/data pairs. Keep the existing captioned recordings and transcripts for replay. Playback counters reflect concurrent desktop decoding. They are unsuitable for mobile playback benchmarks. [Device-width media captures](evidence/media-layout)

## first-value

Code highlight, CPU original, device value and returned CPU result remain in stable columns. Seven stages make the host/device distinction legible. In the prediction frame the device write has yet to take effect. [Stage frames](evidence/frames/first-value.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Create the CPU array | 0.50–4.68 | This line creates out_host, a CPU array containing one zero. |
| 2. Copy the array to GPU memory | 9.18–15.77 | cuda.to_device copies the array into GPU memory. The original stays on the CPU. |
| 3. Compile on the CPU, load onto the GPU | 20.27–27.62 | Numba compiles this Python kernel on the CPU. CUDA loads the compiled code onto the GPU when needed. |
| 4. Launch one GPU thread | 32.62–39.68 | One GPU thread runs the kernel. Its argument, out, is the array we just copied into GPU memory. |
| 5. Which array will change? | 44.68–49.29 | Both arrays contain zero. Which array will change when this line runs? |
| 6. Write to the GPU array | 57.79–63.84 | The GPU thread writes 42 to the GPU array. The CPU array still holds zero. |
| 7. Copy the result to CPU memory | 68.34–74.85 | Copy to host waits for the kernel to finish. It returns the value in a new CPU array called result. |

## vector-add

Block 1 lanes 0/1 become indices 32/33; reveal 99 versus skip agrees with Console. The fixed width-32 trace leaves the width-16 edit to mental arithmetic. [Stage frames](evidence/frames/vector-add.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Launch two blocks | 0.50–8.78 | The host launches two blocks of thirty-two GPU threads. The arrays have thirty-three elements, so some threads have no element to write. |
| 2. Find each thread’s index | 13.28–20.81 | Each thread calculates its global index. In block one, thread zero gets thirty-two. The next thread gets thirty-three. |
| 3. Predict which thread writes | 25.31–30.96 | The bounds check compares each index with thirty-three. Which of these two threads enters the if block? |
| 4. Only the valid index writes | 39.46–47.87 | Thread zero writes ninety-nine at index thirty-two. Thread one skips the assignment because index thirty-three is outside the arrays. |

## grid-stride

Two blocks × eight threads yields stride 16. The sequence 3,19,35 makes the exclusive upper bound visible. Add a below-launch-size case after the reveal. [Stage frames](evidence/frames/grid-stride.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Start with a global index | 0.50–7.58 | The host launches sixteen threads for thirty-five elements. Block zero, thread three starts at global index three. |
| 2. Calculate the stride | 12.08–18.55 | The stride equals the total number of threads. Here, two blocks times eight threads gives a stride of sixteen. |
| 3. Predict this thread’s indices | 23.05–30.11 | Starting at three, add sixteen for each visit. Which indices will this thread process before it reaches thirty-five? |
| 4. Visit two array elements | 38.61–47.97 | The thread visits indices three and nineteen. Thirty-five is outside the loop, so it stops. At each visit, the thread doubles the input into the output. |

## transfers

Two upload arrows then a separate allocation, execution and return. The reveal labels three 132-byte transfers. Keep the GPU output allocation distinct when showing integrated memory. [Stage frames](evidence/frames/transfers.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Copy the inputs to GPU memory | 0.50–10.34 | The host copies the two input arrays to GPU memory. Each array contains thirty-three float thirty-two values, and each value occupies four bytes. |
| 2. Allocate and run on the GPU | 14.84–23.35 | The host allocates the output on the GPU. Each active GPU thread reads one value from each input and writes one output. |
| 3. Predict the bytes transferred | 27.85–35.19 | The result comes back to the CPU. Two arrays went to the GPU, and one returns. How many bytes cross between them? |
| 4. Count the three copies | 43.69–50.34 | Each copy moves one hundred thirty-two bytes. Together, the three copies move three hundred ninety-six bytes. |

## coalescing

One numbered lane row becomes read offsets then strided write sectors. The final claim explicitly identifies a calculation. At inline width, reading eight offsets and code together requires close inspection. [Stage frames](evidence/frames/coalescing.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Eight lanes read adjacent values | 0.50–11.59 | In the eight by thirty-two case, the first eight lanes read consecutive values. With four bytes per value, offsets zero through seven fit in one aligned thirty-two byte sector. |
| 2. Predict the transposed writes | 16.09–22.45 | The assignment swaps row and column in the output. Will those same lanes store into one sector or several? |
| 3. Eight lanes write eight sectors | 30.95–41.47 | After the transpose, adjacent lanes write eight words apart. Their offsets are zero, eight, and so on, through fifty-six. Each falls in a different aligned sector. |
| 4. Read the calculation as a model | 45.97–57.38 | Across all thirty-two lanes, the address calculation covers four read sectors and thirty-two write sectors. Actual traffic also depends on the compiled instructions and caches. |

## divergence

Alternating/grouped strips and count text convey participation. The two lane colors are harder to distinguish at phone width. The count text preserves totals; neither frame proves scheduler issue behavior. [Stage frames](evidence/frames/divergence.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Alternating signs split each warp | 0.50–8.16 | Each block contains one warp of thirty-two threads. With alternating signs, neighboring lanes take different paths through the kernel. |
| 2. Predict the negative lanes | 12.66–16.22 | Look at block zero. How many lanes will take the negative path? |
| 3. Sixteen lanes take each path | 24.72–31.38 | Sixteen lanes take the negative path and sixteen take the other path. Both warps contain a mixture of paths. |
| 4. Group the signs | 35.88–46.31 | In the grouped case, the first warp has only negative inputs and the second has only positive inputs. Timing depends on the compiled instructions and work on each path. |

## reduction

Focus moves from loads to the barrier to slots 1/5 and the stored 8. The clip ends after one pairwise stage. Add access to later distances and the block partial. [Stage frames](evidence/frames/reduction.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Load values into shared memory | 0.50–8.84 | In block zero, eight threads copy the values one through eight into shared memory. Each slot belongs to one thread during this first load. |
| 2. Wait for the shared writes | 13.34–18.25 | All threads reach the barrier. Thread one then reads the six stored by thread five. |
| 3. Predict the first addition | 22.75–29.17 | At distance four, thread one adds the value in slot five to its own slot. What will slot one contain? |
| 4. Thread 1 stores the sum | 37.67–46.97 | Thread one adds two and six and stores eight. The other active threads update their slots too. A barrier completes the stage before the next distance. |

## histogram

From four zero counters to bin 2 = 32. Final two-row read/write example correctly permits a lost update. Let the learner select the second operation to show the other possible outcome. [Stage frames](evidence/frames/histogram.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Each token selects a counter | 0.50–8.71 | Each thread reads a token and atomically increments its selected counter. In this case all thirty-two tokens select counter two. |
| 2. Predict the final count | 13.21–18.61 | All counters start at zero. What will counter two contain after all thirty-two updates? |
| 3. Atomic updates count every token | 27.11–31.21 | Counter two contains thirty-two. Every atomic update is counted. |
| 4. Why an ordinary increment can lose a count | 35.71–43.00 | With an ordinary increment, two threads could both read zero and both write one. Two increments would leave a count of one. |

## scan

Frames keep the initial slots on screen through the barrier, then jump to final prefix values. The final 4→3 is correct; the missing intermediate snapshots make the double barrier hard to derive. [Stage frames](evidence/frames/scan.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Load the keep flags | 0.50–8.22 | The block loads the seven keep flags into shared memory. Lane six begins with one, and the extra slot contains zero. |
| 2. Predict the last running total | 12.72–19.68 | Lane six reads from distances one, two, and four over successive stages. What running total will it produce? |
| 3. Wait between reads and writes | 28.18–34.53 | Each stage uses barriers to separate reads from writes, so every lane reads values from the previous stage. |
| 4. Find the kept item’s position | 39.03–46.99 | The inclusive total at index six is four. Since destinations start at zero, the final kept item goes to position three. |

## tiled-transpose

Loader (0,2), slot [2,0], writer (2,0) agree with source. The diagram traces one value. Extend with other active lanes before introducing banks. [Stage frames](evidence/frames/tiled-transpose.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Load the shared tile | 0.50–7.58 | Thread zero, two loads input row two, column zero into the shared tile. The block barrier makes that tile ready. |
| 2. Predict who writes it | 12.08–17.14 | Thread two, zero reads shared tile at two, zero. Which thread loaded that position? |
| 3. The tile swaps coordinates | 25.64–32.10 | Thread zero, two loaded it. Thread two, zero writes that value into output row zero, column two. |

## matmul

Second pass 4,5,6,7 and zero fills for 6/7 match k=6. The walkthrough demonstrates edge handling but ends before an output accumulator is computed. [Stage frames](evidence/frames/matmul.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Load a pair of tiles | 0.50–7.86 | The block stages four inner positions per pass in shared memory. The second pass covers positions four through seven. |
| 2. Predict the padded positions | 12.36–19.74 | The inner dimension contains six positions, zero through five. Which positions in the second pass are outside the input? |
| 3. Fill the tail with zero | 28.24–35.90 | Positions six and seven load zero. Threads still reach the barriers that make the shared tiles ready and protect their reuse. |

## softmax

Scores 1000,999,1000,997,−1000 become 0,−1,0,−3,−2000. Equal shifted logits give equal probabilities. The common denominator is described but never built visually. [Stage frames](evidence/frames/softmax.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Find the row maximum | 0.50–5.81 | One block finds the largest score in the row. Here, that maximum is one thousand. |
| 2. Predict matching probabilities | 10.31–17.14 | Subtracting the maximum gives zero for columns zero and two. Which columns will have equal probabilities? |
| 3. Normalize the shifted scores | 25.64–33.81 | The two zero shifts have the same exponential, one. Dividing by the shared row sum gives those columns equal probabilities. |

## gather

Spaced input: lane 1 reads index 8 then value 108. Final eight distinct value sectors versus one index sector match the aligned fixture model. [Stage frames](evidence/frames/gather.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Follow one indirect read | 0.50–6.84 | Thread one reads index eight from the index array, then fetches value one hundred eight from that position. |
| 2. Predict the sectors | 11.34–17.61 | The indices are eight elements apart. How many aligned thirty-two byte sectors do their value reads touch? |
| 3. Map indices to sectors | 26.11–33.94 | Each value lies in a different sector. The eight consecutive index reads touch one sector, under the same alignment assumption. |

## stencil

Code and diagram link block 1’s left halo (8) with the other two values (9 and 10); 27 matches the shared run. Use the 19 counterexample as the next learner-controlled frame. [Stage frames](evidence/frames/stencil.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Load the center and halo | 0.50–7.37 | Block one starts at index eight. Its first thread also loads the neighbor at index seven into the left halo. |
| 2. Predict the boundary output | 11.87–16.78 | The first output of block one adds these three inputs. What value will it receive? |
| 3. Read the ready tile | 25.28–32.53 | The thread adds eight, nine, and ten to write twenty-seven. The block barrier makes the shared tile ready before the read. |

## precision

Highlights the rounded intermediate at 2²⁴ and contrasts the two groupings. Add the two adjacent representable numbers so a novice can derive the first rounding decision. [Stage frames](evidence/frames/precision.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Round the first addition | 0.50–10.08 | The thread adds one to sixteen million seven hundred seventy-seven thousand two hundred sixteen. Float thirty two rounds the sum back to the original value. |
| 2. Predict the final sum | 14.58–20.00 | The thread then adds the negative of the original value. What happens to the one? |
| 3. Compare the grouping | 28.50–37.18 | The starter grouping returns zero because the one was rounded away. Canceling the large positive and negative values first gives one. |

## sync-debug

The frame highlights slot 3 and output 6. The −1 matches the partial-block run. The absent write alone explains an invalid read; avoid asking for a particular hang. [Stage frames](evidence/frames/sync-debug.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Fill all four shared slots | 0.50–7.75 | Block one has four threads. Thread three is outside the seven-output array, so it stores minus one in its shared slot. |
| 2. Predict the boundary read | 12.25–17.18 | Thread two writes output six using the next slot. What value does it read? |
| 3. Keep the edge thread at the barrier | 25.68–34.00 | Thread two reads minus one from thread three. If thread three returned early, it would skip the shared write and the required block barrier. |

## fusion

Two local inputs, an optional temp round trip, then eight reads and eight writes removed. The model correctly names source traffic. Add a real two-launch comparison for the broader fusion objective. [Stage frames](evidence/frames/fusion.webp)

| Stage | Spoken interval (s) | Caption / transcript checked against stage |
|---|---:|---|
| 1. Compute a local value | 0.50–6.71 | Each thread reads one x and one y value from GPU memory and computes a local intermediate. |
| 2. Predict the saved accesses | 11.21–18.27 | The temporary path writes the intermediate and reads it back. How many temporary reads and writes disappear for eight threads? |
| 3. Remove the temporary traffic | 26.77–36.77 | Keeping the value local removes eight temporary writes and eight temporary reads in this source-level count. Compiler and cache behavior affect measured traffic. |
