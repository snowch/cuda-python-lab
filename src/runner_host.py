"""Execute the editable host program in Pyodide and forward CUDA calls to GPGPU-Sim."""

import ast
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
import sys
from types import ModuleType, SimpleNamespace
import traceback

import numpy as np
from pyodide.ffi import to_js


DTYPES = {name: np.dtype(name) for name in ("bool", "int32", "int64", "float32", "float64")}
CONSOLE_LIMIT = 16384


class Console(StringIO):
    truncated = False

    def write(self, text):
        remaining = max(0, CONSOLE_LIMIT - self.tell())
        self.truncated |= len(text) > remaining
        super().write(text[:remaining])
        return len(text)

    def result(self):
        return self.getvalue() + ("\n[Output truncated.]\n" if self.truncated else "")


def dimensions(value):
    result = (value,) if isinstance(value, int) else tuple(value)
    if not 1 <= len(result) <= 3 or any(type(n) is not int or not 0 < n <= 4096 for n in result):
        raise ValueError("Use up to three positive launch dimensions.")
    return result + (1,) * (3 - len(result))


def kernel_source(tree, name):
    function = next((node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name), None)
    if function is None:
        raise TypeError("Define the GPU kernel at the top level of the program.")
    function.decorator_list = []
    used = {node.id for node in ast.walk(function) if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)}
    constants = []
    for node in reversed(tree.body):
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if isinstance(target, ast.Name) and target.id.isupper() and target.id in used:
            constants.append(node)
            used.update(value.id for value in ast.walk(node.value) if isinstance(value, ast.Name))
    return ast.unparse(ast.Module(body=[*reversed(constants), function], type_ignores=[]))


class DeviceArray:
    def __init__(self, bridge, data):
        if data.dtype.name not in DTYPES or not data.dtype.isnative or not 1 <= data.ndim <= 3:
            raise TypeError("Use a one- to three-dimensional device array of a supported numeric dtype.")
        self.bridge = bridge
        self.handle = bridge.allocate(to_js(data.tobytes()))
        self.dtype, self.shape, self.size, self.strides = data.dtype, data.shape, data.size, data.strides
        self.ndim = data.ndim
        self.nbytes = data.nbytes

    def copy_to_host(self, target=None):
        data = bytes(self.bridge.read(self.handle).to_py())
        array = np.frombuffer(data, dtype=self.dtype).reshape(self.shape).copy()
        if target is None:
            return array
        np.copyto(target, array)
        return target

    def copy_to_device(self, data):
        data = np.asarray(data, dtype=self.dtype)
        if data.shape != self.shape:
            raise ValueError("The host and device array shapes must match.")
        self.bridge.upload(self.handle, to_js(data.tobytes()))

    def describe(self):
        return ({"dtype": self.dtype.name, "ndim": self.ndim},
                {"buffer": self.handle, "elements": self.size, "itemsize": self.dtype.itemsize,
                 "shape": self.shape, "strides": self.strides})


def describe_argument(arg):
    if isinstance(arg, DeviceArray):
        return arg.describe()
    defaults = {int: "int64", float: "float64", bool: "bool"}
    value = np.asarray(arg, dtype=defaults.get(type(arg)))
    if value.ndim or value.dtype.name not in DTYPES:
        raise TypeError("Pass a numeric scalar or a device array to the kernel.")
    return ({"dtype": value.dtype.name, "ndim": 0},
            {"value": str(int.from_bytes(value.tobytes(), "little")), "bytes": value.dtype.itemsize})


class Kernel:
    def __init__(self, bridge, name, source):
        self.bridge, self.name, self.source = bridge, name, source

    def __getitem__(self, shape):
        if not isinstance(shape, tuple) or len(shape) != 2:
            raise ValueError("Launch the kernel with kernel[blocks, threads_per_block](...).")
        grid, block = map(dimensions, shape)

        def launch(*args):
            signature, values = zip(*map(describe_argument, args)) if args else ((), ())
            self.bridge.launch(json.dumps({"source": self.source, "kernel": self.name, "signature": signature,
                                           "args": values, "grid": grid, "block": block}))

        return launch


def run_program(source, filename, bridge):
    console = Console()
    previous = sys.modules.get("numba")
    try:
        tree = ast.parse(source, filename=filename)

        def jit(function=None):
            if function is None:
                return jit
            return Kernel(bridge, function.__name__, kernel_source(ast.parse(source), function.__name__))

        numba = ModuleType("numba")
        numba.cuda = SimpleNamespace(
            jit=jit,
            to_device=lambda array: DeviceArray(bridge, np.ascontiguousarray(array)),
            device_array=lambda shape, dtype=np.float64: DeviceArray(bridge, np.empty(shape, dtype=dtype)),
            synchronize=lambda: None,
        )
        for name in DTYPES:
            setattr(numba, name, DTYPES[name].type)
        sys.modules["numba"] = numba
        with redirect_stdout(console), redirect_stderr(console):
            exec(compile(tree, filename, "exec"), {"__name__": "__main__"})
        return json.dumps({"stdout": console.result()})
    except Exception:
        return json.dumps({"stdout": console.result(), "error": traceback.format_exc(limit=8)[-4500:]})
    finally:
        if previous is None:
            sys.modules.pop("numba", None)
        else:
            sys.modules["numba"] = previous
