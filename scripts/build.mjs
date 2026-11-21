import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
import { lessons, modules } from "../src/course.mjs";

const root = new URL("../", import.meta.url);
const src = new URL("src/", root);
const dist = new URL("dist/", root);
const vendor = new URL("vendor/", root);
const pyodide = new URL("node_modules/pyodide/", root);

for (const directory of ["", "gpu/", "runtime/"]) {
  await mkdir(new URL(directory, dist), { recursive: true });
}
await Promise.all(
  ["index.html", "app.mjs", "styles.css", "course.mjs", "diagrams.mjs", "host-program.mjs", "notebook.mjs", "walkthroughs.mjs",
    "browser-runner.mjs", "run-worker.mjs", "gpgpu-device.mjs", "runner_host.py"]
    .map((name) => cp(new URL(name, src), new URL(name, dist))),
);
await cp(new URL("media/", src), new URL("media/", dist), { recursive: true });

const runtime = new URL("runtime/", dist);
const lock = JSON.parse(await readFile(new URL("pyodide-lock.json", pyodide), "utf8"));
async function checkedAsset(name, hash, compressed = false) {
  const raw = await readFile(new URL(name, vendor));
  const bytes = compressed ? gunzipSync(raw) : raw;
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`Unexpected checksum for ${name}.`);
  return bytes;
}
const numpy = lock.packages.numpy;
const [simulatorJS, simulatorWasm, numpyWheel] = await Promise.all([
  checkedAsset("gpgpu-sim.js.gz", "fdc787d13622f972f89a93ede2835d5ddba4db1992d3f7df360fe3735ad4ee7d", true),
  checkedAsset("gpgpu-sim.wasm.gz", "59fa21ccd1a1f3b4e82e51a7436c925aad72e1b8f415eabee81fbac231708919", true),
  checkedAsset(numpy.file_name, numpy.sha256),
]);
const factory = "async function createModuleSimulator(";
const instantiate = "wasmExports = await (createWasm());";
const glue = simulatorJS.toString();
if (!glue.includes(factory) || !glue.includes(instantiate)) throw new Error("Unexpected GPGPU-Sim factory.");
// The worker compiles the Wasm module once, then instantiates a fresh device
// synchronously when Python launches a kernel from a different PTX module.
const simulator = glue.replace(factory, "function createModuleSimulator(")
  .replace(instantiate, `wasmExports = new WebAssembly.Instance(Module.wasmModule, getWasmImports()).exports;
assignWasmExports(wasmExports);
updateMemoryViews();`);
await Promise.all([
  ...["pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"].map((name) =>
    cp(new URL(name, pyodide), new URL(name, runtime))),
  writeFile(new URL("gpgpu-sim.mjs", runtime), simulator + "\nexport default createModuleSimulator;\n"),
  writeFile(new URL("gpgpu-sim.wasm", runtime), simulatorWasm),
  writeFile(new URL(numpy.file_name, runtime), numpyWheel),
  cp(new URL("pyodide-LICENSE.txt", vendor), new URL("pyodide-LICENSE.txt", runtime)),
  cp(new URL("gpgpu-sim-LICENSE.txt", vendor), new URL("gpgpu-sim-LICENSE.txt", runtime)),
  writeFile(new URL("compiler-config.json", dist), JSON.stringify({ url: process.env.CUDA_COMPILER_URL || null })),
]);
const editorBuild = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: [fileURLToPath(new URL("editor.mjs", src))],
  outfile: fileURLToPath(new URL("editor.mjs", dist)),
  bundle: true,
  format: "esm",
  minify: true,
  legalComments: "linked",
  banner: { js: "/*! Bundled license notices: editor.LICENSE.txt */" },
  metafile: true,
});
const editorPackages = new Set(Object.keys(editorBuild.metafile.inputs)
  .flatMap((file) => {
    const dependency = file.match(/^(.+\/)?node_modules\/(@[^/]+\/[^/]+|[^/]+)\//);
    return dependency ? [dependency[0]] : [];
  }));
const licenses = await Promise.all([...editorPackages].sort().map(async (directory) =>
  directory + "\n" + (await readFile(new URL(directory + "LICENSE", root), "utf8")).trim(),
));
await writeFile(new URL("editor.LICENSE.txt", dist), licenses.join("\n\n") + "\n");

const slugs = modules.flatMap((module) => module.lessons);
if (new Set(slugs).size !== slugs.length || slugs.length !== Object.keys(lessons).length) {
  throw new Error("Each course lesson must appear in exactly one module.");
}
const starters = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [
  slug, await readFile(new URL(`kernels/${slug}.py`, src), "utf8"),
])));
await writeFile(new URL("starters.json", dist), JSON.stringify(starters));

const gpuFiles = ["requirements.txt", "profile_workloads.py", "debug_workloads.py", "INVESTIGATIONS.md"];
const archive = Object.fromEntries(await Promise.all(gpuFiles.map(async (name) => [
  name, await readFile(new URL(`gpu/${name}`, src)),
])));
for (const [slug, source] of Object.entries(starters)) {
  archive[`kernels/${slug}.py`] = strToU8(source);
}

await writeFile(new URL("gpu/requirements.txt", dist), archive["requirements.txt"]);
await writeFile(new URL("gpu/cuda-python-investigations.zip", dist), zipSync(archive));
console.log(`Built ${slugs.length} lessons in ${fileURLToPath(dist)}`);
