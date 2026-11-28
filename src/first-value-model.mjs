// A source-level model for the authored one-element float32 fixture.
// Match the entire file. A changed launch, host operation or extra statement
// leaves the model's domain even if it happens to print a familiar value.
import {variant} from './guided-experiments.mjs';

export function firstValuePrograms(starter) {
  const programs = new Map();
  for (const host of [0,5]) for (const store of [42,73]) for (const printed of [false,true]) {
    const edits = [...(store === 73 ? ['write73'] : []), ...(printed ? ['originalHost'] : [])];
    let source = variant(starter, edits);
    if (host === 5) source = source.replace('np.zeros(1, dtype=np.float32)', 'np.array([5], dtype=np.float32)');
    programs.set(source, {host,store,printed,source});
  }
  return programs;
}

export function firstValuePrediction(program) {
  if (!program) return {
    question: 'What do you expect the open program to print?',
    evidence: 'These edits are outside the array model. Follow your print statements and check their output in the Console.',
  };
  const observation = program.printed
    ? 'This program prints result, then out_host.'
    : 'This program prints only result. To check out_host too, add print(out_host.tolist()) before return result.';
  return {
    question: 'The host starts at '+program.host+' and the kernel stores '+program.store+'. After copy-back, what will the original host (out_host), device (out) and copied host (result) arrays each contain?',
    evidence: observation+' The intermediate device value comes from the source-level model.',
  };
}

export const stages = ['Predict the values','Create the host array','Copy to the device','Compile the kernel','Launch one thread','Store on the device','Copy back','Return the result'];

export function firstValueStep(program, index) {
  const {host,store,printed} = program;
  const rows = [
    ['Host · before main()', 'def main():', 'The program will start with '+host+' on the host and store '+store+' on the device. Inspect the arrays before and after each line.'],
    ['Host · initialization', 'out_host =', 'The CPU creates out_host with one float32 element. It is the original array.'],
    ['Host · copy to device', 'out = cuda.to_device(out_host)', 'The host copies the element into a separate device allocation named out. Both arrays now contain the starting value.'],
    ['Host · compilation', '@cuda.jit', 'The decorator marks kernel for compilation. At launch the browser compiler produces PTX instructions for GPGPU-Sim. A native CUDA environment loads compiled code for the physical GPU. Compilation changes no array values.'],
    ['Host · launch', 'kernel[1, 1](out)', 'The host launches one block of one thread with out as its argument. Before the thread writes, which of the two existing arrays can this kernel change?'],
    ['Device · kernel', 'out[0] = '+store, 'The device thread writes '+store+' into element 0 of out. It has no argument pointing to the original host array.'],
    ['Host · copy from device', 'result = out.copy_to_host()', 'The host waits for the store and copies out into a new CPU array, result. The original out_host still contains '+host+'.'],
    ['Host · return', 'return result', 'main() prints the copied result'+(printed?' and then the original host array':'')+' and returns result. Compare the real prints in the Console with your prediction.'],
  ];
  const roles = [
    [], ['Created'], ['Read','Created'], [], [null,'Argument'],
    [null,'Written'], [null,'Read','Created'], [printed?'Printed':null,null,'Returned'],
  ];
  const [context,anchor,explanation]=rows[index];
  const lines=program.source.split('\n'), line=lines.findIndex(text=>text.trim().startsWith(anchor));
  return {context,anchor:lines[line].trim(),line:line+1,explanation,roles:roles[index],
    values:[index>=1?host:null,index>=2?(index>=5?store:host):null,index>=6?store:null]};
}
