import createNvptxCompiler from "./runtime/nvptx.mjs";

const localPath = (name) => new URL(name, import.meta.url).href;
const numbaWheel = "./runtime/numba-0.68.1-cp312-cp312-pyodide_2024_0_wasm32.whl";

export async function fetchAsset(name) {
  const response = await fetch(localPath(name));
  if (!response.ok) throw new Error("Could not load " + name + " (HTTP " + response.status + ").");
  return response;
}

function intrinsicMath(ir) {
  // LLVM's NVPTX backend supplies these instructions without NVIDIA's libdevice.
  let exponent = 0;
  const lowered = ir.replace(/@"(__nv_\w+)"/g, "@$1")
    .replaceAll("@__nv_fmaxf(", "@llvm.maxnum.f32(")
    .replaceAll("@__nv_fmax(", "@llvm.maxnum.f64(")
    .replaceAll("@__nv_fminf(", "@llvm.minnum.f32(")
    .replaceAll("@__nv_fmin(", "@llvm.minnum.f64(")
    .replaceAll("@__nv_sqrtf(", "@llvm.sqrt.f32(")
    .replaceAll("@__nv_sqrt(", "@llvm.sqrt.f64(")
    .replace(/^(  +)(%[^ ]+) = call float @__nv_expf\(float ([^)]+)\)$/gm,
      (_, indent, target, value) => {
        const scaled = "%lab_exponent_" + exponent++;
        // f32 log2(e), expressed as the LLVM assembler's hexadecimal float.
        return indent + scaled + " = fmul float " + value + ", 0x3FF7154760000000\n"
          + indent + target + " = call float @llvm.nvvm.ex2.approx.f(float " + scaled + ")";
      })
    .replace("declare float @__nv_expf(float", "declare float @llvm.nvvm.ex2.approx.f(float");
  const unsupported = lowered.match(/@__nv_(\w+)\(/);
  if (unsupported) {
    throw new Error("This device math function (" + unsupported[1] + ") needs NVIDIA libdevice. Run it in the GPU notebook.");
  }
  return lowered;
}

export async function loadCompiler(python) {
  const [llvmlite, validation, frontend, wasm] = await Promise.all([
    fetchAsset("./runtime/llvmlite.zip").then((response) => response.arrayBuffer()),
    fetchAsset("./compile_kernel.py").then((response) => response.arrayBuffer()),
    fetchAsset("./wasm-numba.py").then((response) => response.text()),
    fetchAsset("./runtime/nvptx.wasm").then((response) => response.arrayBuffer()),
    python.loadPackage(localPath(numbaWheel)),
  ]);
  python.FS.writeFile("/llvmlite.zip", new Uint8Array(llvmlite));
  python.FS.writeFile("compile_kernel.py", new Uint8Array(validation));
  python.runPython('import sys\nsys.path.insert(0, "/llvmlite.zip")');
  const lower = python.runPython(frontend + "\nlower_kernel");
  const diagnostics = [];
  const backend = await createNvptxCompiler({
    wasmBinary: new Uint8Array(wasm),
    noInitialRun: true,
    printErr(line) {
      diagnostics.push(line);
      if (diagnostics.length > 5) diagnostics.shift();
    },
  });

  return (kernel) => {
    const ir = intrinsicMath(lower(JSON.stringify(kernel)));
    diagnostics.length = 0;
    backend.FS.writeFile("/kernel.ll", ir);
    try {
      const exit = backend.callMain(["/kernel.ll", "/kernel.ptx", "/entries"]);
      if (exit) throw new Error("LLVM could not compile the kernel to PTX.\n" + diagnostics.join("\n"));
      const ptx = backend.FS.readFile("/kernel.ptx", { encoding: "utf8" });
      const entry = ptx.match(/\.entry\s+(\w+)\s*\(/)?.[1];
      if (!entry) throw new Error("LLVM did not generate a CUDA kernel entry point.");
      return { ptx, entry };
    } finally {
      for (const path of ["/kernel.ll", "/kernel.ptx", "/entries"]) {
        if (backend.FS.analyzePath(path).exists) backend.FS.unlink(path);
      }
    }
  };
}
