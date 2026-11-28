"""Cross-compile a downloaded first-value notebook kernel on a CPU host, without launching it."""
import argparse
import json
import runpy
from pathlib import Path

import numba_cuda_mlir
from numba_cuda_mlir import tools

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("notebook", type=Path, help="first-value.ipynb downloaded from the browser")
args = parser.parse_args()
assert numba_cuda_mlir.__version__ == "0.6.0"
# The same version-specific host capability query is bypassed in scripts/check_native.py.
tools._cached_cc = (8, 7)
book = json.loads(args.notebook.read_text())
header, source = book["cells"][4]["source"].split("\n", 1)
assert header == "%%experiment first-value one exported"
footer = 'if __name__ == "__main__":\n    actual = main()\n'
assert source.endswith(footer)
source = source.removesuffix(footer) + '''from numba_cuda_mlir import types
import inspect
print("JIT source from notebook namespace:")
print(inspect.getsource(kernel.py_func).strip())
ptx, _ = cuda.compile_ptx(kernel.py_func, (types.Array(types.float32, 1, "C"),), cc=(8,7))
assert ".entry" in ptx and ".target sm_87" in ptx
for line in ptx.splitlines():
    if ".target " in line or ".entry " in line:
        print(line.strip())
'''
print("CPU cross-compilation, explicit target SM 8.7, MLIR", numba_cuda_mlir.__version__)
print("First-value export: replaced only the host launch footer with compiler inspection.")
runtime = Path(__file__).resolve().parents[3] / "src/notebook-runtime.py"
runpy.run_path(str(runtime))["execute_program"](source)
print("Virtual source recovered and PTX entry emitted. No NVIDIA device or kernel launch used.")
