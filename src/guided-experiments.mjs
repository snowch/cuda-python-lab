// The number links a phase to an authored instruction. Storage and selection use the named IDs.
const printBeforeReturn = expression => ['    return result', '    print(' + expression + ')\n    return result'];
export const edits = {
  write73: ['out[0] = 42', 'out[0] = 73'],
  originalHost: printBeforeReturn('out_host.tolist()'),
  launch16: ['kernel[2, 32]', 'kernel[3, 16]'],
  launch8: ['kernel[2, 8]', 'kernel[2, 4]'],
  bytes: printBeforeReturn('x_host.nbytes, y_host.nbytes, result.nbytes'),
  column: printBeforeReturn('result[:8, 0]'),
  counts: printBeforeReturn('np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0)'),
  plain: ['cuda.atomic.add(counts, tokens[i], 1)', 'counts[tokens[i]] += 1'],
  coordinate: printBeforeReturn('result[0, 2]'),
  unpad: ['PADDING = 1', 'PADDING = 0'],
  sumRows: printBeforeReturn('result.sum(axis=1)'),
  unshift: ['math.exp(values[row, col] - row_max)', 'math.exp(values[row, col])'],
  finite: printBeforeReturn('np.isfinite(result).all()'),
  direct: ['values[indices[i]]', 'values[i]'],
  halo: ['tile[0] = values[i - 1] if i > 0 else 0.0', 'tile[0] = 0.0'],
  regroup: ['a[i] + b[i]', 'a[i] + c[i]', 'first + c[i]', 'first + b[i]'],
  sentinel: ['else -1', 'else -9'],
  bypass: ['if use_temp:', 'if False:'],
};

export function variant(starter, editIds = []) {
  let program = starter;
  for (const id of editIds) {
    const pairs = edits[id];
    for (let i = 0; i < pairs.length; i += 2) {
      if (!program.includes(pairs[i])) throw Error('Missing source for guided edit ' + id);
      program = program.replaceAll(pairs[i], pairs[i + 1]);
    }
  }
  return program;
}

// Each phase can reuse an earlier authored edit. Preparation supplies its starting point;
// the learner performs the change under "instruction". A blank instruction uses the original text.
function phase(step, id, fixture, title, evidence, options = {}) {
  return {step, id, fixture, title, evidence, before:[], after:[], kind:'run', ...options};
}
const read = {kind:'reason'};
export const guides = {
  'first-value': [
    phase(1,'copy','one','Find the device copy','Read the argument to cuda.to_device in main().',{...read,anchor:'cuda.to_device(out_host)'}),
    phase(2,'run','one','Run the starter','Read the value printed by main() in the Console.'),
    phase(3,'write','one','Change the device value','Compare the two Console runs.',{after:['write73'],instruction:'Change out[0] = 42 to out[0] = 73. Run and read the copied result.'}),
    phase(3,'host','one','Inspect the original host array','Compare the copied result with the original host array in the same run.',{before:['write73'],after:['originalHost'],anchor:'return result',instruction:'Keep the kernel that writes 73. Add print(out_host.tolist()) immediately before return result in main(). Run again.'}),
  ],
  'vector-add': [
    phase(1,'launch','partial-32','Count the launched threads','Read the last output and multiply the two launch dimensions.'),
    phase(2,'owner','partial-32','Locate index 32','Use quotient and remainder with a block width of 32.',read),
    phase(3,'narrow','partial-32','Change the launch width','Compare the last output and the owner of index 32.',{after:['launch16'],anchor:'kernel[2, 32]'}),
  ],
  'grid-stride': [
    phase(1,'visits','stride-16','Trace the sixteen-thread launch','Compare the listed indices with the printed array.'),
    phase(2,'eight','stride-16','Halve the block width','Compare the full array and the spacing between visits.',{after:['launch8'],anchor:'kernel[2, 8]'}),
    phase(3,'overlap','stride-16','Reason about an incorrect stride','On paper, list the visits of global threads 3 and 7 using a stride of four.',{...read,before:['launch8'],instruction:'Keep the eight-thread launch. For Thread 3 in each block, list the indices below 35 it would visit if the stride were four. What is their first shared index?'}),
  ],
  transfers: [
    phase(1,'bytes','affine-33','Measure the three array sizes','Run before and after inserting the print. Sum the three printed byte counts.',{after:['bytes'],anchor:'return result'}),
    phase(2,'traffic','affine-33','Count accesses in the kernel','Use the assignment to count reads and writes per active thread.',{...read,before:['bytes']}),
    phase(3,'short','affine-8','Repeat the byte count','Read the three byte counts and count the active threads.',{after:['bytes'],anchor:'return result',instruction:'Run the 8-element starter. In main(), insert print(x_host.nbytes, y_host.nbytes, result.nbytes) immediately before return result and rerun. Compare the total with the 33-element case. Explain the i < n guard for both launches.'}),
  ],
  coalescing: [
    phase(1,'column','wide','Read a transposed column','Compare the printed slice with the first eight input values.',{after:['column'],anchor:'return result'}),
    phase(2,'sectors','wide','Calculate sector numbers','Assume aligned arrays and 32-byte sectors. Use float32 word offsets.',{...read,before:['column']}),
    phase(3,'edge','narrow','Count sectors at the edge','Use word offsets 60–64 and eight words per sector.'),
  ],
  divergence: [
    phase(1,'negative','alternating','Trace the first negative value','Compare the first two outputs to −1 and 2.'),
    phase(2,'count','alternating','Count the two branch paths','Run after inserting the print. Read the negative count for each block.',{after:['counts'],anchor:'return result'}),
    phase(3,'group','grouped','Compare grouped signs','Compare the counts with the alternating case.',{after:['counts'],anchor:'return result',instruction:'Run Grouped signs. In main(), insert print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0)) before return result and rerun. In which case does a warp take both paths?'}),
  ],
  reduction: [
    phase(1,'partials','full-16','Check two block sums','Compare the hand sum with out[0].'),
    phase(2,'pair','full-16','Locate the first pair','Trace Thread 1 and the producer of scratch[5].',read),
    phase(3,'tail','tail-19','Sum the partial block','Compare out[2] with the last three inputs.'),
  ],
  histogram: [
    phase(1,'balanced','balanced','Count the balanced bins','Record counts[2] and the sum of all bins.',{instruction:'Run Balanced destinations and record its four counters. Continue with the hot-bin case in the next task.'}),
    phase(1,'hot','hot','Count one hot bin','Compare counts[2] and the total with Balanced destinations.',{instruction:'Run All tokens route to 2 with the atomic starter. Compare with the four balanced counters.'}),
    phase(2,'race','hot','Remove atomicity','Record several runs. An observed count is one simulator outcome of a race.',{after:['plain']}),
    phase(3,'restore','hot','Restore the atomic update','Check counts[2] after restoring the original line.',{before:['plain'],anchor:'counts[tokens[i]] += 1',instruction:'Replace counts[tokens[i]] += 1 with cuda.atomic.add(counts, tokens[i], 1) and rerun. Explain how two threads can lose an increment with the plain assignment.',returnsStarter:true}),
  ],
  scan: [
    phase(1,'destination','flags','Find the final destination','Subtract one from the final inclusive total.'),
    phase(2,'lane','flags','Trace Lane 6','List the source lane at each doubling distance.',read),
    phase(3,'weights','weights','Scan weighted counts','Compare the final output with the sum of all input weights.'),
  ],
  'tiled-transpose': [
    phase(1,'coordinate','square','Trace one transposed value','Compare the printed value with values_host.',{after:['coordinate'],anchor:'return result'}),
    phase(2,'padding','square','Remove tile padding','Calculate both word offsets and banks. Matching output cannot identify the padding.',{before:['coordinate'],after:['unpad']}),
    phase(3,'edges','edges','Check the padded edge tile','Use the padded starter. Locate out[12, 10] in the transposed output.'),
  ],
  matmul: [
    phase(1,'passes','rectangular','List the inner passes','Read the range in the kernel and check the product in the Console.'),
    phase(2,'zero','rectangular','Trace zero-filled tile entries','Trace the second pass against the inner dimension of six.',read),
    phase(3,'reuse','square','Identify shared tile reuse','Compare the number of passes with the rectangular case.'),
  ],
  softmax: [
    phase(1,'sums','extreme','Check row normalization','Compare columns 0 and 2 and read both printed sums.',{after:['sumRows'],anchor:'return result'}),
    phase(2,'overflow','extreme','Remove the maximum shift','Check the finiteness flag. Nonfinite probabilities are evidence for this edit.',{before:['sumRows'],after:['unshift','finite']}),
    phase(3,'lane','wide-37','Trace the stable 37-column row','Read the finite row output and derive Lane 0’s columns from the final loop.'),
  ],
  gather: [
    phase(1,'adjacent','consecutive','Match a consecutive index','Compare indices_host[1] with out[1].',{instruction:'Run Consecutive positions. Read the second entry of indices_host in main() and find the value fetched at out[1].'}),
    phase(1,'spaced','spaced','Match a spaced index','Compare the second fetched value with the consecutive case.',{instruction:'Run Spaced positions. Match indices_host[1] to out[1] and compare with Consecutive positions.'}),
    phase(2,'adjacent-sectors','consecutive','Count consecutive sectors','Use aligned 32-byte sectors and four-byte values.',read),
    phase(2,'spaced-sectors','spaced','Count spaced sectors','Compare the two sets of sector numbers.',read),
    phase(3,'direct','spaced','Remove index indirection','Compare the fetched values and calculate sectors for indices 0–7.',{after:['direct']}),
  ],
  stencil: [
    phase(1,'reads','direct','Count direct neighbor reads','Count valid input reads at endpoints and interior positions.',{instruction:'Run 16 values · direct reads. Record out[8]. Count array reads at the two endpoints and the fourteen interior positions.'}),
    phase(1,'compare','shared','Compare the shared tile','Compare all 16 outputs with the direct case.',{instruction:'Run 16 values · shared tile with the starter. Compare its output array with the direct-read run.'}),
    phase(2,'loads','shared','Trace the halo loads','Use the starter kernel to identify the input for the left neighbor of out[8].',read),
    phase(3,'omit','shared','Omit the left halo','Compare out[8] with the original shared-tile result.',{after:['halo'],instruction:'In the 16-value shared case replace tile[0] = values[i - 1] if i > 0 else 0.0 with tile[0] = 0.0. Run again and compare out[8].'}),
    phase(3,'tail','tail','Check the partial tile','Check out[8] and the last valid output.',{instruction:'Use the 13-value starter with its original left-halo load. Run and inspect the partial block, including out[8] and the last output.'}),
  ],
  precision: [
    phase(1,'round','near','Observe float32 rounding','Compare both outputs with the exact sum of one.'),
    phase(2,'regroup','near','Change the grouping','Identify which thread’s output changes.',{after:['regroup']}),
    phase(3,'small','small','Check the original grouping','Check the first addition in the source as well as both outputs.'),
  ],
  'sync-debug': [
    phase(1,'full','full','Read from a full block','Record out[6] and identify its producer.',{instruction:'Run 8 outputs · two full blocks. Follow the shared read that supplies out[6].'}),
    phase(1,'partial','partial','Read from a partial block','Compare out[6] and its producer with the full block.',{instruction:'Run 7 outputs · partial block. Compare out[6] with the full-block run and identify the supplying thread.'}),
    phase(2,'sentinel','partial','Change the fallback value','Locate every changed output.',{after:['sentinel']}),
    phase(3,'barrier','partial','Reason about an early return','Trace the missing shared write and barrier participant on paper.',{...read,before:['sentinel'],anchor:'cuda.syncthreads()'}),
  ],
  fusion: [
    phase(1,'store','temporary','Count temporary traffic','Count the logical array operations per active thread.'),
    phase(2,'keep','local','Keep the intermediate local','Compare outputs and multiply the eliminated operations by eight.'),
    phase(3,'bypass','temporary','Bypass the temporary branch','Compare the output with the eight-value keep-local run.',{after:['bypass']}),
  ],
};

const questions = {
  'vector-add': {'partial-16':'With 33 elements and 16 threads per block, which block and lane write index 32? How many launched threads skip the write?', 'exact-32':'With 32 elements and 32 threads, which thread writes the last value? How many skip the write?'},
  'grid-stride': {'stride-8':'With eight threads and 35 elements, which indices does global thread 3 visit?', 'short-7':'With seven elements and sixteen launched threads, how many threads enter the loop?'},
  transfers:{'affine-33':'With 33 float32 values per array, how many logical bytes do the two input copies and one output copy request?', 'affine-8':'For eight float32 elements in each of x, y and out, how many bytes cross between host and device in total?'},
  coalescing:{narrow:'For the five active reads at word offsets 60 through 64, how many aligned 32-byte sectors do the lanes touch?'},
  divergence:{alternating:'In the alternating case, how many lanes in each 32-thread block take the negative path?', grouped:'With 32 negatives followed by 32 positives, which block takes the negative path?'},
  reduction:{'tail-19':'Which inputs reach the last partial sum when 19 values are reduced in eight-thread blocks?', 'wide-39':'How many inputs contribute to each partial sum with 39 inputs and 32 threads per block?'},
  histogram:{balanced:'With 32 tokens distributed evenly over four bins, what do you expect in counts[2]?'},
  scan:{weights:'For the thirteen weights in values_host, what should the final inclusive total equal?'},
  'tiled-transpose':{edges:'Which input value appears at out[12, 10] when the 11 × 13 input is transposed?'},
  matmul:{square:'How many four-wide inner passes are needed for two 4 × 4 matrices?'},
  softmax:{'wide-37':'With 37 columns and 32 threads per row, which columns does Lane 0 write? What should each stable probability row sum to?'},
  gather:{consecutive:'With indices 0–7 and eight float32 words per aligned sector, how many sectors contain the gathered values?'},
  stencil:{direct:'At out[8], which three values does the direct-read kernel add?',tail:'With 13 inputs and eight threads per block, which input supplies the left halo for out[8]? Which neighbor is missing at the last output?'},
  precision:{small:'For a = 100 and 1000, does float32 preserve the added 1 before subtracting a?'},
  'sync-debug':{full:'In two full four-thread blocks, which lane provides the value read at out[6]?'},
  fusion:{local:'With eight active threads keeping the intermediate local, how many temporary-array accesses do they perform?',tail:'For thirteen active threads, how many temporary reads and writes does keeping intermediates local avoid?'},
};
export const caseQuestion = (slug,lesson,fixture) => questions[slug]?.[fixture.id] ?? lesson.predict;
