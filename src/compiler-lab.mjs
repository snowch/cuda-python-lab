// Optional GPU investigation: the browser simulator is not a hardware timer.
export const compilerProgram = `from time import perf_counter
import numpy as np
from numba_cuda_mlir import cuda

@cuda.jit
def add_bias(values, out, bias):
    i = cuda.grid(1)
    if i < values.size:
        out[i] = values[i] + bias

def main():
    values = cuda.to_device(np.arange(1024, dtype=np.float32))
    out = cuda.device_array_like(values)
    bias = np.float32(1)
    cuda.synchronize()

    start = perf_counter()
    add_bias[4, 256](values, out, bias)
    cuda.synchronize()
    first_launch_ms = (perf_counter() - start) * 1000

    samples = []
    for _ in range(5):
        start = perf_counter()
        add_bias[4, 256](values, out, bias)
        cuda.synchronize()
        samples.append((perf_counter() - start) * 1000)
    warm_median_ms = float(np.median(samples))
    result = out.copy_to_host()
    np.testing.assert_array_equal(result, np.arange(1024, dtype=np.float32) + bias)
    print("first_launch_ms =", first_launch_ms)
    print("warm_median_ms =", warm_median_ms)
    print("first_value =", result[0])
    print("compiled_signatures =", len(add_bias.signatures))
    return result

if __name__ == "__main__":
    actual = main()
`;
const markdown=source=>({cell_type:'markdown',metadata:{},source});
const code=source=>({cell_type:'code',metadata:{},source,execution_count:null,outputs:[]});
export function compilerNotebook() {
 return {nbformat:4,nbformat_minor:2,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python'},accelerator:'GPU'},cells:[
  markdown('# What happens at the first launch?\n\nOptional lab after “One thread, one element”. Use an NVIDIA GPU with compute capability 7.0 or later, Python 3.12 and a CUDA 12-compatible driver. In Colab choose Runtime → Change runtime type → GPU. Run the cells in order. The installation cell prepares the compiler; the program prepares two arrays on the GPU. Predict whether first_launch_ms or warm_median_ms will be larger.'),
  code('%pip install "numba-cuda-mlir[cu12]==0.6.0" "numpy>=1.26,<2.5"'),
  code('from numba_cuda_mlir import cuda\nif not cuda.is_available():\n    raise RuntimeError("Select an NVIDIA GPU runtime and restart the kernel.")'),
  code(compilerProgram),
  markdown('## Compare the launch times\n\nFind first_launch_ms and warm_median_ms in the output. Both include Python launch overhead, waiting for the GPU and the kernel execution; array allocation and transfers are outside the timed sections. The first launch can also include compilation and runtime initialization. A slower first launch is consistent with that extra work, but the difference does not isolate compiler time. Clock changes and scheduling can also affect the result.\n\nRun the next cell unchanged. It uses the same function, argument types and running process, so its first launch can reuse an already compiled kernel.'),
  code('actual = main()'),
  markdown('## Change a value without changing its type\n\nThe next cell uses the existing function twice, with float32 values 1 and 7. Predict first_value for each call, then run the cell. Compare signatures_before with signatures_after: did a new value of the same type require another compiled version? Change np.float32(7) to np.float32(11) in this cell and run it again. Check first_value and both signature counts. The function is not redefined during this comparison.'),
  code('values = cuda.to_device(np.arange(1024, dtype=np.float32))\nout = cuda.device_array_like(values)\nbefore = len(add_bias.signatures)\nfor bias in (np.float32(1), np.float32(7)):\n    add_bias[4, 256](values, out, bias)\n    cuda.synchronize()\n    print("bias =", float(bias), "first_value =", out.copy_to_host()[0])\nprint("signatures_before =", before)\nprint("signatures_after =", len(add_bias.signatures))'),
  markdown('## Connect the compiler to the GPU\n\nNumba-CUDA-MLIR lowers the Python kernel through MLIR (a compiler representation), then produces PTX. The CUDA driver turns PTX into machine code for the selected GPU. The CPU launches work; GPU streaming multiprocessors execute the launched threads. MLIR is a compiler representation, not an execution unit inside the GPU. This browser course uses a separate compatibility compiler and GPGPU-Sim; its elapsed run time is not an NVIDIA GPU benchmark. No MLIR syntax is required to write the kernels in this course.'),
 ]};
}
export function compilerLabHTML() {
 return `<div class="lesson-page">
 <header class="lesson-heading"><h1>What happens at the first launch?</h1><p class="lead">Connect a Python kernel, its compiler and the hardware that executes it.</p></header>
 <section class="reading"><h2>Why can the first launch take longer?</h2>
 <p>After <strong>One thread, one element</strong>, use this optional notebook on an NVIDIA GPU. Predict whether the first launch will take longer than repeated launches of the same function.</p>
 <figure class="compiler-pipeline"><div><strong>Python kernel</strong><span>Written on the CPU</span></div><span aria-hidden="true">→</span><div><strong>MLIR → PTX</strong><span>Compiled on the CPU</span></div><span aria-hidden="true">→</span><div><strong>GPU machine code</strong><span>Prepared by the driver</span></div><span aria-hidden="true">→</span><div><strong>GPU threads</strong><span>Execute on SMs</span></div><figcaption>MLIR is a compiler representation. An SM (streaming multiprocessor) is hardware inside the GPU that executes groups of threads.</figcaption></figure>
 <p>The notebook prepares arrays on the GPU and supplies a kernel that adds a value to every element. No knowledge of MLIR syntax is required.</p>
 <p><button class="button primary" id="download-compiler-notebook">Download GPU notebook</button></p>
 <p>Open the notebook in Colab or Jupyter and run its cells in order. It requires an NVIDIA GPU with compute capability 7.0 or later. <a href="#gpu">GPU setup instructions</a></p></section>
 <section class="reading"><h2>What to inspect</h2><p>Compare <code>first_launch_ms</code> with <code>warm_median_ms</code>. Both include CPU launch overhead, waiting and GPU execution. The first launch can also include compilation and initialization; the difference does not measure compilation alone.</p><p>The notebook then changes a <code>float32</code> argument while keeping the function and argument types. Compare <code>signatures_before</code> with <code>signatures_after</code>: did changing only the value require another compiled version?</p><p>Use the notebook for these timings. The browser’s Code runner time includes startup, compilation and simulation on this device and cannot measure NVIDIA GPU performance.</p></section>
 <p><a href="#lesson/vector-add">Return to One thread, one element</a> · <a href="#course">Course outline</a></p></div>`;
}
