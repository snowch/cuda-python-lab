import { loadPyodide } from "./runtime/pyodide.mjs";
import { openDevice } from "./gpgpu-device.mjs";
import { fetchAsset, loadCompiler } from "./wasm-compiler.mjs";

let runtime;
const status = (message) => postMessage({ status: message });

async function initialise() {
  const [[compile, python], host, wasmModule] = await Promise.all([
    loadPyodide({ indexURL: new URL("./runtime/", import.meta.url).href, packages: ["numpy"] })
      .then(async (python) => [await loadCompiler(python), python]),
    fetchAsset("./runner_host.py").then((response) => response.text()),
    fetchAsset("./runtime/gpgpu-sim.wasm").then(async (response) => WebAssembly.compile(await response.arrayBuffer())),
  ]);
  return { execute: python.runPython(host + "\nrun_program"), compile, wasmModule };
}

self.onmessage = async ({ data: { source, filename } }) => {
  try {
    status(runtime ? "Preparing the CUDA program…" : "Loading Python, the compiler, and GPGPU-Sim…");
    const { execute, compile, wasmModule } = await (runtime ??= initialise().catch((error) => {
      runtime = undefined;
      throw error;
    }));
    const device = openDevice(wasmModule, compile, status);
    const result = JSON.parse(execute(source, filename, device));
    postMessage({ ...result, ...device.report() });
  } catch (error) {
    postMessage({ error: error.message });
  }
};
