"""Native lesson support embedded in each exported IPython notebook."""
import contextlib
import hashlib
import io
import json
import linecache
import platform
import re
import sys
from importlib import metadata
from pathlib import Path


def lab_preflight():
    """Report the running environment. No install, kernel launch or backend substitution."""
    print(f"Python {platform.python_version()} · {platform.platform()} · {sys.executable}")
    jetpack = Path("/etc/nv_tegra_release")
    if jetpack.is_file():
        print("Jetson Linux:", jetpack.read_text().splitlines()[0])
    versions = {}
    for package in ("numba-cuda-mlir", "numpy", "cuda-bindings", "cuda-toolkit", "nvidia-cuda-nvcc-cu12"):
        try:
            versions[package] = metadata.version(package)
        except metadata.PackageNotFoundError:
            versions[package] = "not installed"
        print(f"{package}: {versions[package]}")
    try:
        from cuda.bindings import runtime
        status, runtime_version = runtime.cudaRuntimeGetVersion()
        print(f"CUDA runtime API: {runtime_version} ({status})")
        if int(status) or not 12000 <= runtime_version < 13000:
            raise RuntimeError("The pinned cu12 environment needs a working CUDA 12 runtime.")
        from cuda.bindings import driver
        status, driver_version = driver.cuDriverGetVersion()
        print(f"Driver CUDA API: {driver_version} ({status})")
        if int(status) or driver_version < 12000:
            raise RuntimeError("The pinned runtime needs a compatible NVIDIA driver.")
        from numba_cuda_mlir import cuda
        if versions["numba-cuda-mlir"] != "0.6.0":
            raise RuntimeError("This course pins numba-cuda-mlir 0.6.0. Check the installation plan above.")
        if not cuda.is_available():
            raise RuntimeError("The selected Python kernel cannot access an NVIDIA GPU.")
        device = cuda.get_current_device()
        print(f"Native device: {device.name!s}; compute capability {device.compute_capability}")
        if tuple(device.compute_capability) < (7, 0):
            raise RuntimeError("The pinned backend requires compute capability 7.0 or later.")
    except Exception as error:
        print(f"Native execution unavailable: {type(error).__name__}: {error}")
        print("Check GPU allocation, driver and kernel environment. On Jetson, check JetPack and the ARM64 package plan.")
        return False
    print("Device detected. Run a program cell to verify compilation and execution on this device.")
    return True


def _task(case, key):
    task = LAB["tasks"][key]
    if task["case"] != case:
        raise ValueError(f"Task {key} belongs to case {task['case']}, not {case}.")
    return task


def _apply_edits(source, ids):
    for edit in ids:
        pairs = LAB["edits"][edit]
        for old, new in zip(pairs[::2], pairs[1::2]):
            source = source.replace(old, new)
    return source


def lab_start(case, key):
    """Return a fresh copy of the supplied source without modifying any cell."""
    starter = LAB["cases"][case]["starter"]
    if key == "exported":
        if case != LAB["exportedCase"]:
            raise ValueError("Choose the case named above Your exported program.")
        return LAB["exported"]
    if key == "starter":
        return starter
    return _apply_edits(starter, _task(case, key)["before"])


def _target(case, key):
    task = _task(case, key)
    if task["restore"]:
        return LAB["cases"][case]["starter"]
    return _apply_edits(lab_start(case, key), task["after"])


def _compare(actual, expected, spec):
    """Compare without converting the learner's output to the reference dtype or shape."""
    import numpy as np
    ref = np.array(expected, dtype=spec["dtype"]).reshape(spec["shape"])
    shape_ok = isinstance(actual, np.ndarray) and actual.shape == ref.shape
    dtype_ok = getattr(actual, "dtype", None) == ref.dtype
    soft = LAB["lesson"] == "softmax"
    rtol, atol = (1e-5, 1e-7) if soft else (0, 0)
    print(f"  Shape: {getattr(actual, 'shape', None)}; expected {ref.shape} · {'match' if shape_ok else 'different'}")
    print(f"  Dtype: {getattr(actual, 'dtype', None)}; expected {ref.dtype} · {'match' if dtype_ok else 'different'}")
    if not shape_ok or actual.dtype.kind not in "fiu":
        print("  Finiteness and values: unavailable for this shape or element type.")
        return False
    # Only authored overflow locations may be NaN. Infinity is never a reference value.
    finite_ok = np.array_equal(np.isnan(actual), np.isnan(ref)) and not np.isinf(actual).any()
    print(f"  Finiteness: {int(np.isfinite(actual).sum())}/{ref.size} finite; expected NaNs {int(np.isnan(ref).sum())} · {'match' if finite_ok else 'different'}")
    close = np.isclose(actual, ref, rtol=rtol, atol=atol, equal_nan=True) if soft else np.equal(actual, ref)
    print(f"  Values: {int(close.sum())}/{ref.size} match (rtol={rtol:g}, atol={atol:g}).")
    if not close.all():
        index = tuple(int(i) for i in np.argwhere(~close)[0])
        print(f"  First difference at {index}: observed {actual[index]}, expected {ref[index]}.")
    return bool(shape_ok and dtype_ok and finite_ok and close.all())


def _check_prints(lines, references):
    """The authored host prints follow the primary result, in source order."""
    import numpy as np
    if not references:
        return True
    extra = lines[1:]
    if len(extra) != len(references):
        print(f"  Additional output: expected {len(references)} lines, observed {len(extra)}.")
        return False
    for line, reference in zip(extra, references):
        if isinstance(reference, str):
            match = line.strip() == reference
        else:
            tokens = re.findall(r"[-+]?(?:nan|inf|(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)", line.lower())
            values = np.array([float(t) for t in tokens])
            expected = np.asarray(reference, dtype=float)
            atol = 2e-6 if LAB["lesson"] == "softmax" else 0
            match = values.shape == expected.shape and np.allclose(values, expected, atol=atol, rtol=0, equal_nan=True)
        if not match:
            print(f"  Additional output differs: {line!r}; expected {reference}.")
            return False
    print("  Additional host output matches the requested observation.")
    return True


def assess(case, key, source, actual, lines):
    import numpy as np
    spec = LAB["cases"][case]
    # IPython may supply one fewer terminal newline to a cell magic.
    body = source.rstrip("\n")
    starter = spec["starter"].rstrip("\n")
    print("Starter comparison")
    baseline = _compare(actual, spec["expected"], spec)
    task_key = key
    if key == "exported":
        selected = LAB["selectedTask"]
        candidates = [k for k, t in LAB["tasks"].items() if t["case"] == case and t["kind"] == "run"]
        if selected:
            task_key = selected
        elif body == starter:
            task_key = "starter"
        else:
            task_key = next((k for k in candidates if body == _target(case, k).rstrip("\n")), "starter")
    if task_key == "starter":
        if body != starter:
            print("Objective unassessed: this custom program has no matching authored reference.")
            return "unassessed"
        contract = {"policy":"probabilities" if LAB["lesson"] == "softmax" else "values", "values":spec["expected"], "prints":[]}
    else:
        t = _task(case, task_key)
        if t["kind"] == "reason":
            print("Source reasoning: explain the task using the supplied code.")
            return "reasoning"
        if body != _target(case, task_key).rstrip("\n"):
            if body == lab_start(case, task_key).rstrip("\n"):
                print("Starting program executed. Make the requested edit in this cell, then rerun to check its objective.")
                return "starting-point"
            print("Objective unassessed: the program differs from the authored edit for this task.")
            return "unassessed"
        contract = t["objective"]
    policy = contract["policy"]
    print(f"Objective · {task_key}")
    if policy == "race":
        valid = isinstance(actual, np.ndarray) and actual.dtype == np.dtype(spec["dtype"]) and list(actual.shape) == spec["shape"]
        if not valid:
            print("The observed counters have the wrong shape or dtype.")
            return "fail"
        hot = int(np.argmax(spec["expected"]))
        if np.any(np.delete(actual, hot) != 0) or not 1 <= actual[hot] <= spec["expected"][hot]:
            print("Counters fall outside this hot-bin experiment: only the routed bin receives increments.")
            return "fail"
        print(f"Observed counters: {actual.tolist()}. Repeat and record bin 2. Even an exact starter match cannot establish atomicity or race safety.")
        return "observation"
    ok = baseline if contract["values"] == spec["expected"] else _compare(actual, contract["values"], spec)
    if policy == "probabilities" and isinstance(actual, np.ndarray) and list(actual.shape) == spec["shape"] and actual.dtype.kind == "f":
        sums = actual.sum(axis=1, dtype=np.float64)
        print("  Probability row sums:", sums, "(absolute tolerance 2e-6); each probability must be in [0, 1].")
        ok = ok and bool(((actual >= 0) & (actual <= 1)).all() and np.allclose(sums, 1, atol=2e-6, rtol=0))
    if policy == "overflow":
        print("  The unshifted exponential overflows or underflows on these inputs. Compare the NaN locations above.")
    if policy == "precision" and isinstance(actual, np.ndarray) and list(actual.shape) == spec["shape"] and actual.dtype.kind in "fiu":
        exact = np.array(contract["values"])
        print("  Absolute error versus the mathematical sum: starter", abs(np.array(spec["expected"]) - exact), "this run", abs(actual - exact))
    prints_ok = _check_prints(lines, contract["prints"])
    verdict = "pass" if ok and prints_ok else "fail"
    print(f"Numerical objective: {verdict}. Explain the source or measurements requested in the task.")
    return verdict


def execute_program(source):
    """IPython registry-independent execution, with source available for JIT inspection."""
    filename = "<cuda-lab-" + hashlib.sha256(source.encode()).hexdigest() + ">"
    linecache.cache[filename] = (len(source), None, source.splitlines(keepends=True), filename)
    scope = {"__name__": "__main__", "__file__": filename}
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            exec(compile(source, filename, "exec"), scope)
    finally:
        print(output.getvalue(), end="")
    return scope.get("actual"), output.getvalue().splitlines()


def run_experiment(line, cell):
    lesson, case, key = line.split()
    if lesson != LAB["lesson"]:
        raise ValueError("Run the setup cell from this notebook before its program cells.")
    lab_start(case, key)  # Validate the fixture/task binding before executing user code.
    print(f"{lesson} / {case} / {key} · source SHA-256 prefix {hashlib.sha256(cell.encode()).hexdigest()[:16]}")
    if not NATIVE_READY:
        raise RuntimeError("Native preflight did not pass. Review setup and rerun it. No result was checked.")
    try:
        actual, lines = execute_program(cell)
    except Exception:
        print("Program execution failed. No result was checked.")
        raise
    if actual is None:
        print("Objective unassessed: this run did not assign a returned array to actual.")
        return
    assess(case, key, cell, actual, lines)
