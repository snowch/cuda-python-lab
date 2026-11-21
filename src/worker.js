importScripts("./runtime/pyodide.js");

let ready;

async function initialize() {
  const python = loadPyodide({ indexURL: new URL("./runtime/", self.location.href).href });
  const modules = ["simulator.py", "browser_adapter.py"].map(async (filename) => {
    const response = await fetch(`./${filename}`);
    if (!response.ok) throw new Error(`Could not load ${filename}.`);
    return [filename, await response.text()];
  });
  const [pyodide, files] = await Promise.all([python, Promise.all(modules)]);
  for (const [filename, contents] of files) {
    pyodide.FS.writeFile(filename, contents);
  }
  return pyodide.runPython("from browser_adapter import run_from_json\nrun_from_json");
}

self.onmessage = async ({ data }) => {
  try {
    ready ??= initialize();
    const run = await ready;
    const report = JSON.parse(run(data.source, JSON.stringify(data.fixture), data.filename));
    self.postMessage({ id: data.id, ...report });
  } catch (error) {
    ready = null;
    self.postMessage({ id: data.id, error: String(error.message).trim() });
  }
};
