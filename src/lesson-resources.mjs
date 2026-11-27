import {materialSymbol} from './material-symbols.mjs';
const docs='https://nvidia.github.io/numba-cuda-mlir/0.6.0/';
const api=docs+'reference/kernel.html#numba_cuda_mlir.cuda.';
const kernels=docs+'user/kernels.html#';
const memory=docs+'user/memory.html#';
const topics={
 kernel:['Kernel definition','@cuda.jit','Declares a function that runs on the GPU.',kernels+'kernel-declaration'],
 firstLaunch:['Launch syntax','kernel[1, 1](out)','Starts one GPU thread and passes the device array.',kernels+'kernel-invocation'],
 launch:['Launch syntax','kernel[blocks, threads](...)','Requests blocks and threads; arguments supply the arrays and values.',kernels+'kernel-invocation'],
 index:['Thread coordinates','i = cuda.grid(1)','Finds this thread’s global position. Check the input length before indexing.',api+'grid'],
 stride:['Grid-stride loops','for i in range(cuda.grid(1), n, cuda.gridsize(1))','Advances by the total thread count to visit additional inputs.',api+'gridsize'],
 arrays:['GPU arrays','out = cuda.device_array(shape, dtype)','Reserves array storage on the GPU.',memory+'device-arrays'],
 transfer:['Array transfers','result = out.copy_to_host()','Copies the GPU array into a CPU array for inspection.',docs+'reference/memory.html'],
 coalescing:['Memory access grouping','out[col, row] = values[row, col]','Adjacent lane addresses determine the aligned regions requested. Counts do not measure physical GPU time.','https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#coalesced-access-to-global-memory'],
 branches:['Warp branches','if value < 0:','Different paths can use different participating lanes in a warp.','https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html#basics-of-simt'],
 shared:['Shared arrays','tile = cuda.shared.array(shape, float32)','Allocates block-local storage for values reused by threads.',api+'shared.array'],
 barrier:['Block barriers','cuda.syncthreads()','All threads in the block must participate in a block barrier before dependent shared reads.',api+'syncthreads'],
 atomics:['Atomic updates','cuda.atomic.add(counts, category, 1)','Updates the selected count indivisibly; a block barrier is a separate operation.',api+'atomic.add'],
 math:['Kernel math','math.exp(value - row_max)','Exponentiation after subtracting the maximum avoids large positive exponents in softmax.',docs+'user/cudapysupported.html'],
 precision:['Floating-point precision','float32','Each operation can round; changing the order of a sum can change its result.','https://docs.nvidia.com/cuda/floating-point/index.html'],
};
export const lessonTopics={
 'first-value':['kernel','firstLaunch','transfer'],'vector-add':['index','launch'],'grid-stride':['index','stride'],transfers:['arrays','transfer'],coalescing:['index','coalescing'],divergence:['index','branches'],reduction:['shared','barrier'],histogram:['atomics','index'],scan:['shared','barrier'],'tiled-transpose':['shared','coalescing'],matmul:['shared','barrier'],softmax:['math','shared','barrier'],gather:['index','arrays'],stencil:['shared','barrier'],precision:['precision','index'],'sync-debug':['index','barrier'],fusion:['index','arrays'],
};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function resourceSummary(icon,title,description){return `<summary>${materialSymbol(icon,'resource-icon')}<span class="resource-copy"><strong>${esc(title)}</strong><span>${esc(description)}</span></span>${materialSymbol('chevron_right','resource-chevron')}</summary>`;}
export function lessonReferences(slug){
 const selected=lessonTopics[slug].map(key=>topics[key]);
 return `<details class="resource-row lesson-references" id="lesson-references">${resourceSummary('menu_book','References',selected.map(t=>t[0]).join(' · '))}<div class="resource-body"><p class="reference-scope">Python API references match Numba-CUDA-MLIR 0.6.0. External documentation opens in a new tab and needs internet access.</p><ul class="topic-references">${selected.map(([title,syntax,note,url])=>`<li><h3><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)} <span class="small">(new tab)</span></a></h3><code>${esc(syntax)}</code><p>${esc(note)}</p></li>`).join('')}</ul></div></details>`;
}
export function durationLabel(value){const seconds=Math.round(value);return seconds<60?`${seconds} sec`:`${Math.floor(seconds/60)} min${seconds%60?' '+seconds%60+' sec':''}`;}
const focus={transfers:['memory','Arrays move between CPU memory and device memory.'],coalescing:['memory','Addresses from a warp are grouped into memory requests.'],divergence:['sm','Warp instructions use the lanes participating in each path.'],reduction:['shared','Threads exchange partial sums through block-local shared memory.'],histogram:['memory','Threads update shared counts using atomic operations.'],scan:['shared','Each stage reads the preceding stage after a block barrier.'],'tiled-transpose':['shared','A shared tile changes how threads read and write device arrays.'],matmul:['shared','A block reuses input values staged in shared memory.'],softmax:['sm','A block cooperates to compute one row’s maximum, sum and probabilities.'],gather:['memory','Indices select the device-array values read by threads.'],stencil:['shared','A block reuses neighbouring values through shared memory.'],precision:['sm','Thread arithmetic rounds values according to its number format.'],'sync-debug':['shared','All block threads must arrive before dependent shared reads.'],fusion:['sm','Threads can keep an intermediate value local instead of writing it to an array.'],'vector-add':['sm','Each thread writes its assigned output element.'],'grid-stride':['sm','A thread processes several indices over successive loop iterations.']};
export function hardwareLocation(slug){
 if(slug==='first-value')return '';
 const [key,note]=focus[slug];
 return `<figure class="hardware-locator"><figcaption>Where the operation happens</figcaption><div class="locator-system"><div><strong>CPU · host</strong><span>Prepares arrays and launches the kernel</span></div><span class="locator-link">Launch →<br>← Result copy</span><div class="locator-device"><strong>GPU · device</strong><div class="locator-chip ${key==='sm'?'is-focus':''}"><span>Compute chip · SMs</span><span>Threads and arithmetic${key==='shared'?' · <strong>shared memory</strong>':''}</span></div><div class="${key==='memory'?'is-focus':''}">Device memory · GPU arrays</div></div></div><p>${esc(note)} Simplified overview; device memory is separate from the compute chip.</p></figure>`;
}
