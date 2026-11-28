# Guided experiment evidence matrix

The 51 authored instructions appear below in their original order. Seven comparisons or multi-action instructions have separate selectable phases, yielding 58 phases. Each executable row links back to the original audit run numbers. Rows 33, 40, 48 and 52 of that ledger record deliberately dirty setups and are reproduced separately in the [baseline probe](baseline.log). The [execution ledger](guided-runs.jsonl) contains the full Console output, stable case and task IDs, SHA-256 of each complete starting and executed program, and whether preparation was used. The [replay script](run-guides.mjs) independently reconstructs the intended source from the original audit edit pairs and checks the editor export against it before every run.

## Write your first GPU value

- **One element** (`one`). The host array starts with [0.0]. The kernel writes 42 to out[0] on the GPU. What does main() print after copying the value back? What will it print if you change 42 to 73? The pristine Console output matched all 1 reference value.

**1. Find the device copy** · `copy` · One element

Start with the case starter. Find main() in the program. It creates a CPU array with one float32 value, a 32-bit floating-point number. Which line in main() copies that starting value to the GPU?

Evidence. cuda.to_device(out_host) copies the CPU array; the GPU write changes the device allocation. Source-derived reasoning.

**2. Run the starter** · `run` · One element

Start with the case starter. Run the starter program and find out = [42.0] in the output.

Evidence. The copy back prints 42. Audit runs 1.

**3. Change the device value** · `write` · One element

Start with the case starter. Change out[0] = 42 to out[0] = 73. Run and read the copied result.

Evidence. The edited kernel writes 73. The original host array still prints [0.0]. Audit runs 2.

**3. Inspect the original host array** · `host` · One element

Start with the earlier edit `write73`. Keep the kernel that writes 73. Add print(out_host.tolist()) immediately before return result in main(). Run again.

Evidence. The edited kernel writes 73. The original host array still prints [0.0]. Audit runs 3.

## One thread, one element

- **33 elements · 32 threads per block** (`partial-32`). In the 33-element case with 32 threads per block, which block and thread write index 32? How many threads in that block skip the write? The pristine Console output matched all 33 reference values.
- **33 elements · 16 threads per block** (`partial-16`). With 33 elements and 16 threads per block, which block and lane write index 32? How many launched threads skip the write? The pristine Console output matched all 33 reference values.
- **32 elements · exact fit** (`exact-32`). With 32 elements and 32 threads, which thread writes the last value? How many skip the write? The pristine Console output matched all 32 reference values.

**1. Count the launched threads** · `launch` · 33 elements · 32 threads per block

Start with the case starter. Run 33 elements · 32 threads per block. Find the last value in out. In main(), find the two launch dimensions and calculate how many threads start.

Evidence. Two blocks of 32 launch 64 threads. The last sum is 99. Audit runs 4.

**2. Locate index 32** · `owner` · 33 elements · 32 threads per block

Start with the case starter. Use the kernel’s index formula to work out which block and thread write index 32. The quotient of 32 divided by the block width is the block number. The remainder is the thread number.

Evidence. Index 32 is Block 1, Thread 0. The other 31 lanes in that block skip the write. Source-derived reasoning.

**3. Change the launch width** · `narrow` · 33 elements · 32 threads per block

Start with the case starter. In the same program, change kernel[2, 32] to kernel[3, 16] in main(). Rerun and calculate the new block and thread numbers. Check the last value again.

Evidence. Three blocks of 16 launch 48 threads. Block 2, Thread 0 owns the last sum, still 99. Audit runs 5.

## Let each thread do more work

- **35 elements · 16 threads total** (`stride-16`). With 16 threads total and 35 elements, which indices does Block 0, Thread 3 visit? The pristine Console output matched all 35 reference values.
- **35 elements · 8 threads total** (`stride-8`). With eight threads and 35 elements, which indices does global thread 3 visit? The pristine Console output matched all 35 reference values.
- **7 elements · 16 threads total** (`short-7`). With seven elements and sixteen launched threads, how many threads enter the loop? The pristine Console output matched all 7 reference values.

**1. Trace the sixteen-thread launch** · `visits` · 35 elements · 16 threads total

Start with the case starter. Run 35 elements · 16 threads total. Follow the loop for Block 0, Thread 3 by listing range(3, 35, 16). Check the output values at those indices.

Evidence. Thread 3 visits 3 and 19, producing 8 and 40. Audit runs 6.

**2. Halve the block width** · `eight` · 35 elements · 16 threads total

Start with the case starter. Change kernel[2, 8] to kernel[2, 4] in main() and rerun. List range(3, 35, 8) and check that the resulting array stays the same.

Evidence. With stride 8 it visits 3, 11, 19 and 27; the corresponding values are 8, 24, 40 and 56. Audit runs 7.

**3. Reason about an incorrect stride** · `overlap` · 35 elements · 16 threads total

Start with the earlier edit `launch8`. Keep the eight-thread launch. For Thread 3 in each block, list the indices below 35 it would visit if the stride were four. What is their first shared index?

Evidence. Thread 3 in Blocks 0 and 1 starts at 3 and 7. With stride 4 both visit 7, 11, …, 31. Source-derived reasoning.

## Count bytes moved between host and GPU

- **33 elements** (`affine-33`). With 33 float32 values per array, how many logical bytes do the two input copies and one output copy request? The pristine Console output matched all 33 reference values.
- **8 elements** (`affine-8`). For eight float32 elements in each of x, y and out, how many bytes cross between host and device in total? The pristine Console output matched all 8 reference values.

**1. Measure the three array sizes** · `bytes` · 33 elements

Start with the case starter. Run 33 elements. Inside main(), just before return result, add print(x_host.nbytes, y_host.nbytes, result.nbytes). Rerun and add those three byte counts.

Evidence. 132 bytes each for x, y and the result, or 396 bytes. Audit runs 8, 9.

**2. Count accesses in the kernel** · `traffic` · 33 elements

Start with the earlier edit `bytes`. Find the allocation of out in main(). In the kernel, count the array reads and writes in the assignment for one active thread. Multiply by 33 and compare the counts with the three host–device copies.

Evidence. Two float32 reads and one write per active thread request 396 bytes for 33 threads. The three explicit copies also sum to 396 bytes. Source-derived reasoning.

**3. Repeat the byte count** · `short` · 8 elements

Start with the case starter. Run the 8-element starter. In main(), insert print(x_host.nbytes, y_host.nbytes, result.nbytes) immediately before return result and rerun. Compare the total with the 33-element case. Explain the i < n guard for both launches.

Evidence. The three copies request 32 bytes each, totaling 96. The guard admits 8 of 32 threads or 33 of 64. Audit runs 10, 11.

## See how threads group memory accesses

- **8 rows × 32 columns** (`wide`). For the first eight lanes in 8 rows × 32 columns, will the reads of values or the writes to out reach more 32-byte sectors? The pristine Console output matched all 256 reference values.
- **5 rows × 13 columns** (`narrow`). For the five active reads at word offsets 60 through 64, how many aligned 32-byte sectors do the lanes touch? The pristine Console output matched all 65 reference values.

**1. Read a transposed column** · `column` · 8 rows × 32 columns

Start with the case starter. Run 8 rows × 32 columns. In main(), add print(result[:8, 0]) just before return result. Compare those outputs with the first eight entries of values_host in main().

Evidence. The first eight inputs in row 0 become 1 through 8 down output column 0. Audit runs 12, 13.

**2. Calculate sector numbers** · `sectors` · 8 rows × 32 columns

Start with the earlier edit `column`. For Block (0, 0), work out the read and write word offsets for Threads (0, 0) and (7, 0). For a row-major array, offset = row × number of columns + column. Divide the offsets by eight and round down to find their sectors.

Evidence. Threads (0,0)/(7,0) read words 0/7 and write 0/56. Aligned sectors are 0/0 and 0/7. Source-derived reasoning.

**3. Count sectors at the edge** · `edge` · 5 rows × 13 columns

Start with the case starter. Run 5 rows × 13 columns. For Block (1, 1), the first active row has five reads at word offsets 60–64. Use the same formula to count the sectors they occupy.

Evidence. Words 60–64 span aligned sectors 7 and 8. Audit runs 14.

## When threads take different branches

- **Alternating signs** (`alternating`). In the alternating case, how many lanes in each 32-thread block take the negative path? The pristine Console output matched all 64 reference values.
- **Grouped signs** (`grouped`). With 32 negatives followed by 32 positives, which block takes the negative path? The pristine Console output matched all 64 reference values.

**1. Trace the first negative value** · `negative` · Alternating signs

Start with the case starter. Run Alternating signs. Compare the first two inputs, −1 and 2, with the first two output values. Which input was multiplied by 0.25?

Evidence. −1 becomes −0.25, while +2 remains +2. Audit runs 15.

**2. Count the two branch paths** · `count` · Alternating signs

Start with the case starter. In main(), add print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0)) just before return result. The first count is for Block 0 and the second for Block 1.

Evidence. The two alternating blocks contain 16 negative lanes each. Audit runs 16.

**3. Compare grouped signs** · `group` · Grouped signs

Start with the case starter. Run Grouped signs. In main(), insert print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0)) before return result and rerun. In which case does a warp take both paths?

Evidence. Grouped signs gives 32 then 0. Both alternating warps contain lanes on both paths. Counts reveal the sign classes. Audit runs 17, 18.

## Add values across a block

- **16 values · 8 threads per block** (`full-16`). In the eight-thread block, the first pairs are four positions apart. Which thread adds scratch[5] to its own value? What must be ready before it reads scratch[5]? The pristine Console output matched all 2 reference values.
- **19 values · partial block** (`tail-19`). Which inputs reach the last partial sum when 19 values are reduced in eight-thread blocks? The pristine Console output matched all 3 reference values.
- **39 values · 32 threads** (`wide-39`). How many inputs contribute to each partial sum with 39 inputs and 32 threads per block? The pristine Console output matched all 2 reference values.

**1. Check two block sums** · `partials` · 16 values · 8 threads per block

Start with the case starter. Run 16 values · 8 threads per block. Record the two partial sums. Manually add the first eight input values and compare with out[0].

Evidence. The first and second blocks sum to 36 and 100. Audit runs 19.

**2. Locate the first pair** · `pair` · 16 values · 8 threads per block

Start with the case starter. At distance four, find the two input values Thread 1 in Block 0 combines. Use the first scratch assignment to work out which threads write those values and what the first barrier makes possible.

Evidence. In Block 0 lanes 1 and 5 load values 2 and 6. Lane 1 reads both after the load barrier. Source-derived reasoning.

**3. Sum the partial block** · `tail` · 19 values · partial block

Start with the case starter. Run 19 values · partial block with the starter. Only the last three inputs belong to Block 2. Compare their sum with out[2] and explain why out-of-range threads contribute zero.

Evidence. 17 + 18 + 19 = 54. The other five lanes contribute zeros. Audit runs 20.

## Count inputs by category

- **Balanced destinations** (`balanced`). With 32 tokens distributed evenly over four bins, what do you expect in counts[2]? The pristine Console output matched all 4 reference values.
- **All tokens route to 2** (`hot`). When all 32 tokens go to destination 2, which counter changes? What count could two threads produce if both read zero before either writes? The pristine Console output matched all 4 reference values.

**1. Count the balanced bins** · `balanced` · Balanced destinations

Start with the case starter. Run Balanced destinations and record its four counters. Continue with the hot-bin case in the next task.

Evidence. Balanced bin 2 holds 8, hot bin 2 holds 32. Both totals are 32. Audit runs 21.

**1. Count one hot bin** · `hot` · All tokens route to 2

Start with the case starter. Run All tokens route to 2 with the atomic starter. Compare with the four balanced counters.

Evidence. Balanced bin 2 holds 8, hot bin 2 holds 32. Both totals are 32. Audit runs 22.

**2. Remove atomicity** · `race` · All tokens route to 2

Start with the case starter. Keep All tokens route to 2. Replace cuda.atomic.add(counts, tokens[i], 1) with counts[tokens[i]] += 1. Run the program several times and record the values of counts[2].

Evidence. Each repetition is an actual run of a data race. Lane interleavings and counts are not guaranteed on other implementations. Audit runs 23, 24, 25, 26.

**3. Restore the atomic update** · `restore` · All tokens route to 2

Start with the earlier edit `plain`. Replace counts[tokens[i]] += 1 with cuda.atomic.add(counts, tokens[i], 1) and rerun. Explain how two threads can lose an increment with the plain assignment.

Evidence. Restoring the atomic increment gives 32. Two plain increments can both read zero and both write one. Audit runs 27.

## Find positions with running totals

- **Keep flags · 7 elements** (`flags`). For [1, 0, 1, 1, 0, 0, 1], what running total do you expect at index 6? Where would that element move? The pristine Console output matched all 7 reference values.
- **Weighted counts · 13 elements** (`weights`). For the thirteen weights in values_host, what should the final inclusive total equal? The pristine Console output matched all 13 reference values.

**1. Find the final destination** · `destination` · Keep flags · 7 elements

Start with the case starter. Run Keep flags · 7 elements. Read out[6] and subtract one to find the destination of the final kept element.

Evidence. The last inclusive total is 4. The final kept item goes to index 3. Audit runs 28.

**2. Trace Lane 6** · `lane` · Keep flags · 7 elements

Start with the case starter. Follow the assignment to previous for Lane 6. The loop starts at distance one and doubles it on each pass. List the shared-memory indices read by Thread 6.

Evidence. At distances 1, 2 and 4, lane 6 reads lanes 5, 4 and 2. Source-derived reasoning.

**3. Scan weighted counts** · `weights` · Weighted counts · 13 elements

Start with the case starter. Run Weighted counts · 13 elements with the starter and compare the last output with the sum of the inputs. Which parts of the algorithm are the same with flags and weights?

Evidence. The final total is 26. The same distance-doubling loop accumulates weights instead of binary flags. Audit runs 29.

## Transpose through a shared tile

- **8 rows × 8 columns** (`square`). In Block (0, 0) of the 8 × 8 case, which thread loads the input value that Thread (2, 0) writes to out[0, 2]? The pristine Console output matched all 64 reference values.
- **11 rows × 13 columns** (`edges`). Which input value appears at out[12, 10] when the 11 × 13 input is transposed? The pristine Console output matched all 143 reference values.

**1. Trace one transposed value** · `coordinate` · 8 rows × 8 columns

Start with the case starter. Run 8 rows × 8 columns. In main(), add print(result[0, 2]) just before return result. Find the matching input in values_host and identify the thread that loaded it.

Evidence. Output [0,2] is 17, loaded from input [2,0] by Thread (0,2). Audit runs 30, 31.

**2. Remove tile padding** · `padding` · 8 rows × 8 columns

Start with the earlier edit `coordinate`. Find the shared read of tile[tx, ty] for Thread (2, 0). Its word offset is 2 × TILE_STRIDE. Record the offset and bank with PADDING = 1, then set PADDING = 0, rerun, and calculate them again. Compare the output check.

Evidence. For Thread (2,0), stride 9 gives word/bank 18. Stride 8 gives word/bank 16. Both print 17. These are calculated bank numbers. Audit runs 32.

**3. Check the padded edge tile** · `edges` · 11 rows × 13 columns

Start with the case starter. Run 11 rows × 13 columns with the starter. Check the output and locate the last index (12, 10) in the transposed result.

Evidence. The padded starter produces 143 at [12,10]. The original padding is checked in the complete source. Audit runs 34.

## Reuse inputs in matrix multiplication

- **5 × 6 times 6 × 7** (`rectangular`). For 5 × 6 times 6 × 7, which inner indices fall outside the input in the second pass? The pristine Console output matched all 35 reference values.
- **4 × 4 times 4 × 4** (`square`). How many four-wide inner passes are needed for two 4 × 4 matrices? The pristine Console output matched all 16 reference values.

**1. List the inner passes** · `passes` · 5 × 6 times 6 × 7

Start with the case starter. Run 5 × 6 times 6 × 7 and check the result. Find the range with step TILE in the kernel and list the inner indices in each pass.

Evidence. With tile width 4 the inner ranges cover 0–3 and 4–7. Positions 6 and 7 lie beyond the inner dimension. Audit runs 35.

**2. Trace zero-filled tile entries** · `zero` · 5 × 6 times 6 × 7

Start with the case starter. Trace the assignments to tile_a[0, 2] and tile_a[0, 3] for the first block. In the second pass, what values do these two positions get and why?

Evidence. In the second pass inner indices 6 and 7 are out of range; tile_a[0,2] and [0,3] receive zero. Source-derived reasoning.

**3. Identify shared tile reuse** · `reuse` · 4 × 4 times 4 × 4

Start with the case starter. Run 4 × 4 times 4 × 4. Compare the number of passes and explain how a value loaded into a shared tile can serve more than one output.

Evidence. The square case needs one pass. Lanes computing different output columns reuse the same staged A value. Audit runs 36.

## Build a stable softmax

- **Extreme and equal logits** (`extreme`). Row 0 is [1000, 999, 1000, 997, −1000]. What is the exponential of the largest score after subtracting the row maximum? Which two columns should have equal probabilities? The pristine Console output matched all 10 reference values.
- **Two rows · 37 columns** (`wide-37`). With 37 columns and 32 threads per row, which columns does Lane 0 write? What should each stable probability row sum to? The pristine Console output matched all 74 reference values.

**1. Check row normalization** · `sums` · Extreme and equal logits

Start with the case starter. Run Extreme and equal logits. Compare the first and third probabilities in row 0. In main(), add print(result.sum(axis=1)) just before return result and check how close both row sums are to 1.

Evidence. Columns 0 and 2 have the same largest logit. Both row sums print about 1.0000001. Audit runs 37, 38.

**2. Remove the maximum shift** · `overflow` · Extreme and equal logits

Start with the earlier edit `sumRows`. Replace both math.exp(values[row, col] - row_max) calls with math.exp(values[row, col]). In main(), add print(np.isfinite(result).all()) just before return result and rerun. Does the result still contain only finite values?

Evidence. Removing both maximum shifts makes the finiteness flag False. Successful execution can produce NaNs. Audit runs 39.

**3. Trace the stable 37-column row** · `lane` · Two rows · 37 columns

Start with the case starter. Run Two rows · 37 columns with the starter. In the final loop, list the columns where Lane 0 writes. How does the number of threads per block set their spacing?

Evidence. The stable 37-column rows are finite. Lane 0 writes columns 0 and 32. The spacing equals the block width. Audit runs 41.

## Read values through an index array

- **Consecutive positions** (`consecutive`). With indices 0–7 and eight float32 words per aligned sector, how many sectors contain the gathered values? The pristine Console output matched all 8 reference values.
- **Spaced positions** (`spaced`). If the eight indices are [0, 8, 16, 24, 32, 40, 48, 56], how many sectors do reads of indices and reads of values touch? The pristine Console output matched all 8 reference values.

**1. Match a consecutive index** · `adjacent` · Consecutive positions

Start with the case starter. Run Consecutive positions. Read the second entry of indices_host in main() and find the value fetched at out[1].

Evidence. Second index 1 fetches 101; second index 8 fetches 108. Audit runs 42.

**1. Match a spaced index** · `spaced` · Spaced positions

Start with the case starter. Run Spaced positions. Match indices_host[1] to out[1] and compare with Consecutive positions.

Evidence. Second index 1 fetches 101; second index 8 fetches 108. Audit runs 43.

**2. Count consecutive sectors** · `adjacent-sectors` · Consecutive positions

Start with the case starter. For each case, find the sectors touched by the reads from values. Divide each index in indices_host by eight and round down. How many different sector numbers do you get?

Evidence. Contiguous indices 0…7 all map to aligned sector 0. Source-derived reasoning.

**2. Count spaced sectors** · `spaced-sectors` · Spaced positions

Start with the case starter. For each case, find the sectors touched by the reads from values. Divide each index in indices_host by eight and round down. How many different sector numbers do you get?

Evidence. Indices 0,8,…,56 map to eight aligned sectors, 0…7. Source-derived reasoning.

**3. Remove index indirection** · `direct` · Spaced positions

Start with the case starter. Keep Spaced positions. Replace values[indices[i]] with values[i] and rerun. Compare the output and recalculate the sectors for the direct indices 0–7.

Evidence. Direct reads return 100 through 107, using one value sector. They compute a different mapping. Audit runs 44.

## Share neighboring values across threads

- **16 values · direct reads** (`direct`). At out[8], which three values does the direct-read kernel add? The pristine Console output matched all 16 reference values.
- **16 values · shared tile** (`shared`). At the first position of Block 1, which input from Block 0 must the stencil include? Which shared entry holds it? The pristine Console output matched all 16 reference values.
- **13 values · partial tile** (`tail`). With 13 inputs and eight threads per block, which input supplies the left halo for out[8]? Which neighbor is missing at the last output? The pristine Console output matched all 13 reference values.

**1. Count direct neighbor reads** · `reads` · 16 values · direct reads

Start with the case starter. Run 16 values · direct reads. Record out[8]. Count array reads at the two endpoints and the fourteen interior positions.

Evidence. Both starter paths produce 27 at index 8. Direct reads are 2 per endpoint and 3 per interior element, totaling 46 input reads. Audit runs 45.

**1. Compare the shared tile** · `compare` · 16 values · shared tile

Start with the case starter. Run 16 values · shared tile with the starter. Compare its output array with the direct-read run.

Evidence. Both starter paths produce 27 at index 8. Direct reads are 2 per endpoint and 3 per interior element, totaling 46 input reads. Audit runs 46.

**2. Trace the halo loads** · `loads` · 16 values · shared tile

Start with the case starter. In the shared version, find the loads of tile[lane + 1], tile[0], and tile[WIDTH + 1]. Count the center values and the valid halo values for the two blocks. Which load supplies the left neighbor of out[8]?

Evidence. Sixteen center values and two valid inter-block halos. Block 1 stages input[7] in its own tile[0]. Source-derived reasoning.

**3. Omit the left halo** · `omit` · 16 values · shared tile

Start with the case starter. In the 16-value shared case replace tile[0] = values[i - 1] if i > 0 else 0.0 with tile[0] = 0.0. Run again and compare out[8].

Evidence. Zeroing tile[0] gives 19 at out[8]. Preparing the 13-value starter restores 27 at that index and 25 at the last index. Audit runs 47.

**3. Check the partial tile** · `tail` · 13 values · partial tile

Start with the case starter. Use the 13-value starter with its original left-halo load. Run and inspect the partial block, including out[8] and the last output.

Evidence. Zeroing tile[0] gives 19 at out[8]. Preparing the 13-value starter restores 27 at that index and 25 at the last index. Audit runs 49.

## See how rounding changes a sum

- **Near the precision limit** (`near`). For a = 16,777,216, b = 1, and c = −16,777,216, what happens to the 1 when you add a and b first? What if you add a and c first? The pristine Console output matched all 2 reference values.
- **Smaller integers** (`small`). For a = 100 and 1000, does float32 preserve the added 1 before subtracting a? The pristine Console output matched all 2 reference values.

**1. Observe float32 rounding** · `round` · Near the precision limit

Start with the case starter. Run Near the precision limit. Thread 0 starts with 16,777,216 and Thread 1 starts with 8,388,608. Both add 1 and then subtract their starting value. Compare the two outputs.

Evidence. Original grouping returns [0,1]. At 2²⁴ the added 1 rounds away; at 2²³ it is representable. Audit runs 50.

**2. Change the grouping** · `regroup` · Near the precision limit

Start with the case starter. In the kernel, change a[i] + b[i] to a[i] + c[i] and first + c[i] to first + b[i]. Rerun and explain why only one result changes.

Evidence. Canceling a and c first yields [1,1]. Only the first result changes. Audit runs 51.

**3. Check the original grouping** · `small` · Smaller integers

Start with the case starter. Run Smaller integers with the starter. Check whether the original grouping preserves 1 for both values.

Evidence. The original grouping gives [1,1] for 100 and 1000. The source assertion distinguishes it from the regrouped expression. Audit runs 53.

## Keep edge threads at the barrier

- **7 outputs · partial block** (`partial`). In the 7-output case, which thread in Block 1 supplies the −1? What happens to the barrier if that thread returns first? The pristine Console output matched all 7 reference values.
- **8 outputs · two full blocks** (`full`). In two full four-thread blocks, which lane provides the value read at out[6]? The pristine Console output matched all 8 reference values.

**1. Read from a full block** · `full` · 8 outputs · two full blocks

Start with the case starter. Run 8 outputs · two full blocks. Follow the shared read that supplies out[6].

Evidence. Block 1 lane 3 supplies the shared slot used by lane 2. out[6] is 7 with a full block and −1 with a partial block. Audit runs 54.

**1. Read from a partial block** · `partial` · 7 outputs · partial block

Start with the case starter. Run 7 outputs · partial block. Compare out[6] with the full-block run and identify the supplying thread.

Evidence. Block 1 lane 3 supplies the shared slot used by lane 2. out[6] is 7 with a full block and −1 with a partial block. Audit runs 55.

**2. Change the fallback value** · `sentinel` · 7 outputs · partial block

Start with the case starter. Keep the partial block and change the fallback in slot[lane] = i if i < n else -1 from -1 to -9. Rerun and find every output that changed.

Evidence. Changing the fallback to −9 changes only index 6. Audit runs 56.

**3. Reason about an early return** · `barrier` · 7 outputs · partial block

Start with the earlier edit `sentinel`. Work out what would happen if threads with i >= n returned before the shared-memory assignment. Which shared value would be missing? Which thread would skip the barrier?

Evidence. Block 1 lane 3 would skip the write of slot[3] and the barrier. Lane 2 consumes that slot. No invalid kernel was executed. Source-derived reasoning.

## Remove an intermediate array

- **8 values · store temporary** (`temporary`). For eight inputs, how many global reads and writes can you remove if each thread skips its write to temp and its read from temp? The pristine Console output matched all 8 reference values.
- **8 values · keep local** (`local`). With eight active threads keeping the intermediate local, how many temporary-array accesses do they perform? The pristine Console output matched all 8 reference values.
- **13 values · keep local** (`tail`). For thirteen active threads, how many temporary reads and writes does keeping intermediates local avoid? The pristine Console output matched all 13 reference values.

**1. Count temporary traffic** · `store` · 8 values · store temporary

Start with the case starter. Run 8 values · store temporary. Record the output. Count the input reads, temporary reads, temporary writes, and output writes performed by one active thread.

Evidence. Each active thread reads x, y and temp, writes temp and out. Eight threads perform 24 logical reads and 16 writes. Audit runs 57.

**2. Keep the intermediate local** · `keep` · 8 values · keep local

Start with the case starter. Run 8 values · keep local. Compare the output and identify the two temporary-array operations that disappear. Multiply the per-thread counts by eight for each case.

Evidence. The local path removes one temporary read and write per thread. Totals are 16 reads and 8 writes; outputs agree. Audit runs 58.

**3. Bypass the temporary branch** · `bypass` · 8 values · store temporary

Start with the case starter. In the store-temporary program, change if use_temp: to if False: and rerun. Compare the result with the keep-local case.

Evidence. Forcing the branch off reproduces the keep-local output. Both hosts still allocate and pass temp. Audit runs 59, 60.
