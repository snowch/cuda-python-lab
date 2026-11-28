import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import { strToU8, unzipSync, zipSync } from "fflate";
import { execFileSync } from "node:child_process";
import { buildOffline } from "./offline.mjs";
import {retainPublishedReleases} from './retain-releases.mjs';
import { lessons, modules } from "../src/course.mjs";

const root = new URL("../", import.meta.url);
const src = new URL("src/", root);
const dist = new URL("dist/", root);
const vendor = new URL("vendor/", root);
const pyodide = new URL("node_modules/pyodide/", root);
// ZIP timestamps must not invalidate unchanged compiler files after deployment.
const archiveOptions={mtime:new Date(1980,0,1)};

await rm(dist, {recursive:true, force:true});
for (const directory of ["", "gpu/", "runtime/"]) {
  await mkdir(new URL(directory, dist), { recursive: true });
}
await Promise.all(
  ["index.html", "app.mjs", "styles.css", "runtime-recovery.mjs", "runtime-recovery.css", "home-architecture.mjs", "home-architecture.css", "course.mjs", "diagrams.mjs", "host-program.mjs", "notebook.mjs", "walkthroughs.mjs",
    "code-runner.mjs", "code-runner-host.mjs", "code-runner-settings.mjs", "code-runner.css", "app-status.css", "offline.mjs", "header-controls.mjs", "header-controls.LICENSE.txt", "release-contract.mjs", "release-metadata.mjs", "media-range.mjs", "experiment-state.mjs", "learner-work.mjs", "saved-version.mjs", "guided-experiments.mjs", "guided-panel.mjs", "first-value-model.mjs", "first-value-trace.mjs", "step-controller.mjs", "source-migration.mjs", "compiler-lab.mjs", "material-symbols.mjs", "material-symbols.css", "lesson-resources.mjs", "media-durations.mjs", "browser-runner.mjs", "run-worker.mjs", "wasm-compiler.mjs", "wasm-numba.py", "gpgpu-device.mjs", "runner_host.py"]
    .map((name) => cp(new URL(name, src), new URL(name, dist))),
);
await cp(new URL("fonts/",src),new URL("fonts/",dist),{recursive:true});
await cp(new URL("icons/",src),new URL("icons/",dist),{recursive:true});
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
const numbaWheel = "numba-0.68.1-cp312-cp312-pyodide_2024_0_wasm32.whl";
const [simulatorJS, simulatorWasm, numpyWheel, numba, llvmlite, nvptxJS, nvptxWasm, binding] = await Promise.all([
  checkedAsset("gpgpu-sim.js.gz", "fdc787d13622f972f89a93ede2835d5ddba4db1992d3f7df360fe3735ad4ee7d", true),
  checkedAsset("gpgpu-sim.wasm.gz", "59fa21ccd1a1f3b4e82e51a7436c925aad72e1b8f415eabee81fbac231708919", true),
  checkedAsset(numpy.file_name, numpy.sha256),
  checkedAsset(numbaWheel, "918de23b33f1afffefe3ac47fd01eb91579709e6bec92c343a3f182710ecd893"),
  checkedAsset("llvmlite-ir.zip", "7c1ba9d86b05da3e6c9961662acb1ec8453901fea5f0168c6a2e6c157aa3a402"),
  checkedAsset("nvptx.js.gz", "f92127b1a7ece5a3d2d7c60c3898747f48ab16bd826f2bd3a81b12785feeea5a", true),
  checkedAsset("nvptx.wasm.gz", "b0f8b20f9c9500cade2afd7925235323232f12ed821de8e0c328407c2e4f2f00", true),
  readFile(new URL("wasm-llvm-binding.py", src)),
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
  writeFile(new URL("nvptx.mjs", runtime), nvptxJS.toString() + "\nexport default createNvptxCompiler;\n"),
  writeFile(new URL("nvptx.wasm", runtime), nvptxWasm),
  writeFile(new URL(numbaWheel, runtime), numba),
  writeFile(new URL("llvmlite.zip", runtime), zipSync({
    ...unzipSync(llvmlite),
    "llvmlite/binding/__init__.py": binding,
  },archiveOptions)),
  writeFile(new URL(numpy.file_name, runtime), numpyWheel),
  cp(new URL("compiler/compile_kernel.py", root), new URL("compile_kernel.py", dist)),
  cp(new URL("pyodide-LICENSE.txt", vendor), new URL("pyodide-LICENSE.txt", runtime)),
  cp(new URL("gpgpu-sim-LICENSE.txt", vendor), new URL("gpgpu-sim-LICENSE.txt", runtime)),
]);
// Pyodide 0.27 retries missing local packages on a CDN by default. The pinned
// loader must keep recovery inside the same immutable local runtime directory.
const pyodideLoaderURL = new URL("pyodide.mjs", runtime);
const pyodideLoader = await readFile(pyodideLoaderURL, "utf8");
const externalFallback = 'n.setCdnUrl(`https://cdn.jsdelivr.net/pyodide/v${d.version}/full/`)';
if (pyodideLoader.split(externalFallback).length !== 2) throw new Error("Review changed Pyodide fallback before publishing.");
await writeFile(pyodideLoaderURL, pyodideLoader.replace(externalFallback, "n.setCdnUrl(r.indexURL)"));
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
const notebookRuntime = await readFile(new URL("notebook-runtime.py",src), "utf8");
await writeFile(new URL("notebook-support.mjs",dist), "export default " + JSON.stringify(notebookRuntime) + ";\n");
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
await writeFile(new URL("gpu/cuda-python-investigations.zip", dist), zipSync(archive,archiveOptions));
console.log(`Built ${slugs.length} lessons in ${fileURLToPath(dist)}`);

let identity = {commit:null,date:null};
let version = '<span class="build-info">Development build</span>';
try {
  const dirty = execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
  if (!dirty) {
    const [commit, date] = execFileSync('git',['log','-1','--format=%H%n%cs'],{cwd:root,encoding:'utf8'}).trim().split('\n');
    identity = {commit,date};
    version = `<span class="build-info">Commit <a href="https://github.com/snowch/cuda-python-lab/commit/${commit}">${commit.slice(0,7)}</a> · ${date}</span>`;
  }
} catch { /* Source archives remain buildable without inventing a revision. */ }
const html = (await readFile(new URL('index.html',dist),'utf8')).replace('</body>',`<span hidden>${version}</span></body>`);
await writeFile(new URL('index.html',dist),html);
const release=await buildOffline(fileURLToPath(dist),identity);
if(process.env.PUBLISHED_COURSE_URL){
 release.retainedReleases=await retainPublishedReleases(fileURLToPath(dist),process.env.PUBLISHED_COURSE_URL,{currentId:release.id});
 await writeFile(new URL('release.json',dist),JSON.stringify(release));
 await writeFile(new URL(`releases/${release.id}/release.json`,dist),JSON.stringify(release));
}
