import { loadPyodide } from "./runtime/pyodide.mjs";
import { openDevice } from "./gpgpu-device.mjs";

let runtime;
const status = (message) => postMessage({ status: message });

async function fetchAsset(name) {
  const response = await fetch(new URL(name, import.meta.url));
  if (!response.ok) throw new Error(`Could not load ${name} (HTTP ${response.status}).`);
  return response;
}

async function initialise() {
  const [python, host, wasmModule] = await Promise.all([
    loadPyodide({ indexURL: new URL("./runtime/", import.meta.url).href, packages: ["numpy"] }),
    fetchAsset("./runner_host.py").then((response) => response.text()),
    fetchAsset("./runtime/gpgpu-sim.wasm").then(async (response) => WebAssembly.compile(await response.arrayBuffer())),
  ]);
  return { execute: python.runPython(`${host}\nrun_program`), wasmModule };
}

function requestCompiler(endpoint, kernel) {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", endpoint, false);
  xhr.setRequestHeader("Content-Type", "application/json");
  try {
    xhr.send(JSON.stringify(kernel));
  } catch {
    throw new Error("Could not reach the compiler service. Check its URL and allowed origins.");
  }

  let result;
  try {
    result = JSON.parse(xhr.responseText);
  } catch {
    throw new Error(`The compiler did not return PTX (HTTP ${xhr.status}).`);
  }
  if (xhr.status !== 200 || typeof result.ptx !== "string" || typeof result.entry !== "string") {
    throw new Error(result.error || `Compilation failed (HTTP ${xhr.status}).`);
  }
  return result;
}

self.onmessage = async ({ data: { source, filename, endpoint } }) => {
  try {
    status(runtime ? "Preparing the CUDA program…" : "Loading Python and GPGPU-Sim…");
    const { execute, wasmModule } = await (runtime ??= initialise().catch((error) => {
      runtime = undefined;
      throw error;
    }));
    const device = openDevice(wasmModule, (kernel) => requestCompiler(endpoint, kernel), status);
    const result = JSON.parse(execute(source, filename, device));
    postMessage({ ...result, ...device.report() });
  } catch (error) {
    postMessage({ error: error.message });
  }
};
