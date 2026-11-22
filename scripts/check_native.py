"""Exercise exports on an NVIDIA GPU, or cross-compile with Numba-CUDA-MLIR."""

import argparse
import ast
import contextlib
import io
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate_notebook(case):
    import numpy as np

    cells = [cell["source"] for cell in case["notebook"]["cells"] if cell["cell_type"] == "code"]
    namespace = {"__name__": "__main__"}
    with contextlib.redirect_stdout(io.StringIO()) as console:
        for cell in cells[1:]:
            exec(cell, namespace)
    np.testing.assert_allclose(
        namespace["actual"].ravel(), case["fixture"]["expected"], rtol=1e-5, atol=1e-6,
    )
    size = namespace["actual"].size
    assert f"{size} of {size} values match the starter reference." in console.getvalue()


def validate_program(case):
    import numpy as np

    with contextlib.redirect_stdout(io.StringIO()) as console:
        exec(case["program"], {"__name__": "__main__"})
    label, result = console.getvalue().strip().split(" = ", 1)
    fixture = case["fixture"]
    assert label == fixture["output"]
    actual = np.asarray(ast.literal_eval(result))
    assert actual.shape == tuple(fixture["buffers"][label]["shape"])
    np.testing.assert_allclose(actual.ravel(), fixture["expected"], rtol=1e-5, atol=1e-6)


def compile_kernel(source, fixture):
    from numba_cuda_mlir import cuda, types

    namespace = {}
    exec(source, namespace)
    signature = []
    for name in fixture["args"]:
        if name in fixture["buffers"]:
            spec = fixture["buffers"][name]
            dtype = getattr(types, spec["dtype"])
            signature.append(types.Array(dtype, len(spec["shape"]), "C"))
        else:
            signature.append(types.float32 if isinstance(fixture["scalars"][name], float) else types.int64)
    ptx, _ = cuda.compile_ptx(namespace["kernel"].py_func, tuple(signature), cc=(8, 0))
    if ".entry" not in ptx:
        raise AssertionError("Expected a CUDA entry point in the compiled PTX")


def validate_investigations(compile_only=False):
    import sys

    import numpy as np
    from numba_cuda_mlir import cuda

    sys.path[:0] = [str(ROOT / "src"), str(ROOT / "src/gpu")]
    from debug_workloads import shared_handoff, write_indices
    from profile_workloads import chunked_affine, clamp_to_zero, fusion_variants, make_tiled_transpose

    if not compile_only:
        values = np.arange(17 * 41, dtype=np.float32).reshape(17, 41)
        for pad in (0, 1):
            out = np.empty_like(values.T, order="C")
            make_tiled_transpose(pad)[(2, 1), (32, 8)](values, out, 17, 41)
            np.testing.assert_array_equal(out, values.T)
        x = np.arange(61, dtype=np.float32)
        y = 2 * x
        for streams in (1, 2):
            run, out = chunked_affine(x, y, np.float32(2.5), 17, streams)
            run()
            np.testing.assert_array_equal(out, 2.5 * x + y)
        x = np.arange(67, dtype=np.float32) - 32
        y = -x
        out, temp = np.empty_like(x), np.empty_like(x)
        for width in (32, 64):
            for _, run, _, _ in fusion_variants(x, y, temp, out, x.size, np.float32(2.5), width):
                run()
                np.testing.assert_array_equal(out, np.maximum(2.5 * x + y, 0))
        out = np.empty(33, dtype=np.int32)
        write_indices[2, 32](out, False)
        np.testing.assert_array_equal(out, np.arange(33, dtype=np.int32))
        out = np.empty(64, dtype=np.int32)
        shared_handoff[1, 64](out, False)
        np.testing.assert_array_equal(out, (np.arange(64, dtype=np.int32) + 32) % 64)
    else:
        from numba_cuda_mlir import types

        array = types.Array(types.float32, 2, "C")
        for pad in (0, 1):
            cuda.compile_ptx(
                make_tiled_transpose(pad).py_func, (array, array, types.int64, types.int64), cc=(8, 0),
            )
        vector = types.Array(types.float32, 1, "C")
        output = types.Array(types.int32, 1, "C")
        cuda.compile_ptx(clamp_to_zero.py_func, (vector, vector, types.int64), cc=(8, 0))
        for kernel in (write_indices, shared_handoff):
            cuda.compile_ptx(kernel.py_func, (output, types.boolean), cc=(8, 0), lineinfo=True)



def validate_compiler_lab(compile_only):
    import numpy as np
    from numba_cuda_mlir import cuda, types
    source = subprocess.check_output(["node", "--input-type=module", "-e",
        "import {compilerProgram} from './src/compiler-lab.mjs';process.stdout.write(compilerProgram)"], cwd=ROOT, text=True)
    scope = {"__name__": "compiler_lab"}
    exec(source, scope)
    signature = (types.Array(types.float32, 1, "C"), types.Array(types.float32, 1, "C"), types.float32)
    ptx, _ = cuda.compile_ptx(scope["add_bias"].py_func, signature, cc=(8, 0))
    if ".entry" not in ptx:
        raise AssertionError("The optional compiler lab did not produce a PTX entry")
    if not compile_only:
        np.testing.assert_array_equal(scope["main"](), np.arange(1024, dtype=np.float32) + 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ptx", action="store_true", help="compile for SM 8.0 using the installed CUDA toolkit")
    parser.add_argument("--cpu-only", action="store_true", help="test-only SM 8.0 target fixture for cross-compilation without a CUDA driver")
    args = parser.parse_args()
    if args.cpu_only:
        if not args.ptx:
            parser.error("--cpu-only requires --ptx; it never executes GPU code")
        import numba_cuda_mlir
        from numba_cuda_mlir import tools
        if numba_cuda_mlir.__version__ != "0.6.0":
            raise RuntimeError("Review the explicit-target cross-compilation workaround for this compiler version.")
        # 0.6.0 queries the host capability even with cc=(8,0). This test-only
        # target fixture supplies SM 8.0 without pretending to own a GPU.
        tools._cached_cc = (8, 0)
    elif not args.ptx:
        from numba_cuda_mlir import cuda
        if not cuda.is_available():
            parser.error("An NVIDIA GPU is required to execute notebooks; use --ptx --cpu-only for compiler checks.")
    suite = json.loads(subprocess.check_output(["node", ROOT / "scripts/test-cases.mjs"]))
    checked = 0
    for lesson in suite:
        if args.ptx:
            compile_kernel(lesson["source"], lesson["cases"][0]["fixture"])
            checked += 1
        else:
            for case in lesson["cases"]:
                validate_notebook(case)
                validate_program(case)
                checked += 1
    validate_investigations(compile_only=args.ptx)
    validate_compiler_lab(compile_only=args.ptx)
    additional = "native tile, fusion, and debugging kernels" if args.ptx else "native tile, stream, fusion, and debugging examples"
    print(f"Verified {checked} {'PTX kernels' if args.ptx else 'cases in both notebook and program exports'} and {additional}, plus the optional compiler lab.")


if __name__ == "__main__":
    main()
