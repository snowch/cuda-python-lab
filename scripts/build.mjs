import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { strToU8, zipSync } from "fflate";
import { lessons, modules } from "../src/course.mjs";

const root = new URL("../", import.meta.url);
const src = new URL("src/", root);
const dist = new URL("dist/", root);

for (const directory of ["", "runtime/", "gpu/"]) {
  await mkdir(new URL(directory, dist), { recursive: true });
}
await Promise.all(
  ["index.html", "app.mjs", "styles.css", "course.mjs", "diagrams.mjs", "notebook.mjs", "worker.js", "simulator.py"]
    .map((name) => cp(new URL(name, src), new URL(name, dist))),
);
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
await Promise.all(
  ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]
    .map((name) => cp(new URL(`node_modules/pyodide/${name}`, root), new URL(`runtime/${name}`, dist))),
);

const slugs = modules.flatMap((module) => module.lessons);
if (new Set(slugs).size !== slugs.length || slugs.length !== Object.keys(lessons).length) {
  throw new Error("Each course lesson must appear in exactly one module.");
}
const starters = Object.fromEntries(await Promise.all(slugs.map(async (slug) => [
  slug, await readFile(new URL(`kernels/${slug}.py`, src), "utf8"),
])));
await writeFile(new URL("starters.json", dist), JSON.stringify(starters));

const gpuFiles = ["requirements.txt", "profile_workloads.py", "INVESTIGATIONS.md"];
const archive = Object.fromEntries(await Promise.all(gpuFiles.map(async (name) => [
  name, await readFile(new URL(`gpu/${name}`, src)),
])));
for (const [slug, source] of Object.entries(starters)) {
  archive[`kernels/${slug}.py`] = strToU8(source);
}

await writeFile(new URL("gpu/requirements.txt", dist), archive["requirements.txt"]);
await writeFile(new URL("gpu/cuda-python-investigations.zip", dist), zipSync(archive));
console.log(`Built ${slugs.length} lessons in ${fileURLToPath(dist)}`);
