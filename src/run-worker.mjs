import { loadPyodide } from "./runtime/pyodide.mjs";
import { openDevice } from "./gpgpu-device.mjs";
import { fetchAsset, loadCompiler } from "./wasm-compiler.mjs";

let runtime, activeRuntime, device;
function memoryBytes() {
  if (!activeRuntime) return null;
  const buffers = [activeRuntime.python._module?.HEAPU8?.buffer, activeRuntime.compile.memoryBuffer()];
  if (buffers.some(buffer => !buffer)) return null;
  if (device?.memoryBuffer()) buffers.push(device.memoryBuffer());
  return [...new Set(buffers)].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
}
const status = stage => postMessage({stage, phase: stage.startsWith('Loading Python') ? 'starting' : stage.startsWith('Running') ? 'running' : 'compiling', wasmBytes:memoryBytes()});
async function initialise() {
  const [[compile, python], host, wasmModule] = await Promise.all([
    loadPyodide({ indexURL: new URL("./runtime/", import.meta.url).href, packages: ["numpy"] })
      .then(async python => [await loadCompiler(python), python]),
    fetchAsset("./runner_host.py").then(response => response.text()),
    fetchAsset("./runtime/gpgpu-sim.wasm").then(async response => WebAssembly.compile(await response.arrayBuffer())),
  ]);
  return { execute: python.runPython(host + "\nrun_program"), compile, python, wasmModule };
}
self.onmessage = async ({data:{type,source,filename}}) => {
  try {
    status(runtime ? "Preparing the CUDA program…" : "Loading Python, the compiler, and GPGPU-Sim…");
    activeRuntime = await (runtime ??= initialise().catch(error => {runtime=undefined;throw error;}));
    if (type === 'prepare') { postMessage({prepared:true,wasmBytes:memoryBytes()});return; }
    const {execute,compile,python,wasmModule} = activeRuntime;
    device = openDevice(wasmModule, compile, status);
    const result = JSON.parse(execute(source, filename, device));
    const report = device.report();
    device.dispose();device=undefined;
    // Release Python references to the finished program; the toolchain stays ready.
    python.runPython('import gc\ngc.collect()');
    postMessage({...result,...report,programError:Boolean(result.error),wasmBytes:memoryBytes()});
  } catch(error) {
    device?.dispose();device=undefined;
    postMessage({error:error.message,wasmBytes:memoryBytes()});
  }
};
