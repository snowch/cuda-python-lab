importScripts("./runtime/pyodide.js");

let ready;

async function initialize() {
  const pyodide = await loadPyodide({ indexURL: new URL("./runtime/", self.location.href).href });
  const response = await fetch("./simulator.py");
  if (!response.ok) throw new Error("Could not load the CUDA teaching model.");
  pyodide.runPython(await response.text());
  pyodide.runPython(`
import json
def run_from_json(source, fixture):
    return json.dumps(run_lab(source, json.loads(fixture)), allow_nan=False)
`);
  return pyodide.globals.get("run_from_json");
}

self.onmessage = async ({ data }) => {
  try {
    ready ??= initialize();
    const run = await ready;
    const result = JSON.parse(run(data.source, JSON.stringify(data.fixture)));
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error.message).trim() });
  }
};
