"""Exercise exported notebooks with CUDASIM, or compile the kernels to PTX."""

import argparse
import contextlib
import io
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate_notebook(case):
    import numpy as np

    # Timing requires physical hardware. Run the actual exported setup and
    # reference cells here so source, fixtures, launch, and assertions stay in sync.
    cells = [cell["source"] for cell in case["notebook"]["cells"] if cell["cell_type"] == "code"]
    namespace = {}
    with contextlib.redirect_stdout(io.StringIO()):
        for cell in cells[1:-1]:
            exec(cell, namespace)
    np.testing.assert_allclose(
        namespace["actual"].ravel(), case["fixture"]["expected"], rtol=1e-5, atol=1e-6,
    )


def compile_kernel(source, fixture):
    from numba import cuda, types

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


def validate_investigations():
    import sys

    import numpy as np
    from numba import cuda

    sys.path[:0] = [str(ROOT / "src"), str(ROOT / "src/gpu")]
    from profile_workloads import chunked_affine, make_tiled_transpose

    if cuda.config.ENABLE_CUDASIM:
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
    else:
        from numba import types

        array = types.Array(types.float32, 2, "C")
        for pad in (0, 1):
            cuda.compile_ptx(
                make_tiled_transpose(pad).py_func, (array, array, types.int64, types.int64), cc=(8, 0),
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ptx", action="store_true", help="compile for SM 8.0 using the installed CUDA toolkit")
    args = parser.parse_args()
    if not args.ptx:
        os.environ["NUMBA_ENABLE_CUDASIM"] = "1"
    suite = json.loads(subprocess.check_output(["node", ROOT / "scripts/test-cases.mjs"]))
    checked = 0
    for lesson in suite:
        if args.ptx:
            compile_kernel(lesson["source"], lesson["cases"][0]["fixture"])
            checked += 1
        else:
            for case in lesson["cases"]:
                validate_notebook(case)
                checked += 1
    validate_investigations()
    additional = "both native tile variants" if args.ptx else "native tile and stream variants"
    print(f"Verified {checked} {'PTX kernels' if args.ptx else 'exported notebook cases'} and {additional}.")


if __name__ == "__main__":
    main()
