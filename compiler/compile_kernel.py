"""Compile the lab's CUDA kernel subset with Numba's native PTX compiler."""

import ast
from contextlib import redirect_stdout
import json
import math
import operator
import resource
import re
import sys


MAX_SOURCE = 16000
DTYPES = ("int32", "int64", "float32", "float64", "bool")
BUILTINS = {value.__name__: value for value in (range, min, max, abs, int, float, bool, len)}
CALLS = frozenset(BUILTINS) | {
    "int32", "int64", "float32", "float64", "cuda.grid", "cuda.gridsize", "cuda.shared.array",
    "cuda.local.array", "cuda.syncthreads", "cuda.atomic.add", "cuda.atomic.max",
    "math.exp", "math.sqrt", "math.log", "math.sin", "math.cos", "math.isfinite",
}
ATTRIBUTES = CALLS | {"math.inf", "math.nan", "math.pi"} | {
    f"cuda.{dimension}.{axis}"
    for dimension in ("blockIdx", "blockDim", "gridDim", "threadIdx")
    for axis in "xyz"
}

ALLOWED = (
    ast.Assign, ast.AugAssign, ast.If, ast.For, ast.While, ast.Expr, ast.Return, ast.Pass,
    ast.Break, ast.Continue, ast.Name, ast.Load, ast.Store, ast.Constant, ast.Tuple, ast.List,
    ast.Subscript, ast.Slice, ast.Compare, ast.IfExp, ast.BoolOp, ast.BinOp, ast.UnaryOp,
    ast.operator, ast.boolop, ast.unaryop, ast.cmpop, ast.Call, ast.keyword, ast.Attribute,
)

OPERATIONS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
}


def fail(node, message):
    raise ValueError(f"Line {node.lineno}. {message}")


def qualified_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{qualified_name(node.value)}.{node.attr}"
    return ""


def validate_body(kernel):
    for statement in kernel.body:
        for node in ast.walk(statement):
            if not isinstance(node, ALLOWED):
                fail(node, f"{type(node).__name__} is outside the browser kernel subset.")
            if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store):
                fail(node, "Use local variables or array entries for assignments.")
            if isinstance(node, ast.Attribute) and qualified_name(node) not in ATTRIBUTES and not (
                isinstance(node.value, ast.Name) and node.attr in {"shape", "size", "ndim"}
            ) and qualified_name(node) not in {"cuda.atomic", "cuda.shared", "cuda.local",
                                                "cuda.blockIdx", "cuda.blockDim", "cuda.gridDim", "cuda.threadIdx"}:
                fail(node, "This attribute is outside the browser kernel subset.")
            if isinstance(node, ast.Call) and qualified_name(node.func) not in CALLS:
                if qualified_name(node.func) == "print":
                    fail(node, "Use print in main() for browser output. Use the GPU notebook for prints inside a kernel.")
                fail(node, "Use a supported CUDA, math, or Python built-in function in the kernel.")
            if isinstance(node, ast.Constant):
                value = node.value
                if isinstance(value, str) and len(value) <= 512:
                    continue
                if type(value) not in (bool, int, float, type(None)):
                    fail(node, "Use a number, a short string, or None.")
                if type(value) is int and value.bit_length() > 64:
                    fail(node, "Integer constants must fit in 64 bits.")


def constant_value(node, constants):
    if isinstance(node, ast.Constant) and type(node.value) in (bool, int, float):
        value = node.value
    elif isinstance(node, ast.Name) and node.id in constants:
        value = constants[node.id]
    elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = constant_value(node.operand, constants)
        if isinstance(node.op, ast.USub):
            value = -value
    elif isinstance(node, ast.BinOp) and type(node.op) in OPERATIONS:
        value = OPERATIONS[type(node.op)](constant_value(node.left, constants), constant_value(node.right, constants))
    else:
        fail(node, "Kernel constants must be numeric expressions.")
    if not math.isfinite(value) or abs(value) > 2**63:
        fail(node, "Kernel constant is outside the supported range.")
    return value


def inspect_request(request):
    source = request.get("source")
    name = request.get("kernel")
    specs = request.get("signature")
    if not isinstance(source, str) or len(source) > MAX_SOURCE:
        raise ValueError("The kernel source must be under 16,000 characters.")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,63}", name):
        raise ValueError("Use an ASCII Python name for the kernel.")
    if not isinstance(specs, list) or len(specs) > 16 or any(
        not isinstance(spec, dict) or spec.get("dtype") not in DTYPES
        or type(spec.get("ndim")) is not int or not 0 <= spec["ndim"] <= 3 for spec in specs
    ):
        raise ValueError("Use up to 16 arguments with supported numeric types and up to three dimensions.")

    tree = ast.parse(source, filename="kernel.py")
    if sum(1 for _ in ast.walk(tree)) > 4000:
        raise ValueError("The kernel is too large for this compiler.")
    constants = {}
    kernel = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name and kernel is None:
            kernel = node
        elif isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            target = node.targets[0]
            if target.id.startswith("_") or target.id in {"math", "cuda", *CALLS}:
                fail(node, "Choose a different name for the kernel constant.")
            constants[target.id] = constant_value(node.value, constants)
        else:
            fail(node, "Send numeric constants and one CUDA kernel to the compiler.")

    if kernel is None:
        raise ValueError("The named kernel was not found.")
    args = kernel.args
    if (args.posonlyargs or args.kwonlyargs or args.defaults or args.vararg or args.kwarg
            or kernel.decorator_list or kernel.returns is not None
            or getattr(kernel, "type_params", ()) or len(args.args) != len(specs)
            or any(arg.annotation is not None for arg in args.args)):
        fail(kernel, "Use plain positional arguments in the kernel definition.")
    validate_body(kernel)
    return constants, kernel, specs


def compile_request(request):
    constants, kernel, specs = inspect_request(request)
    from numba import cuda, types

    namespace = {"__name__": "lab_kernel", "__builtins__": BUILTINS, "math": math, "cuda": cuda,
                 **{name: getattr(types, name) for name in DTYPES if name != "bool"}, **constants}
    module = ast.Module(body=[kernel], type_ignores=[])
    exec(compile(module, "kernel.py", "exec"), namespace)
    signature = []
    for spec in specs:
        dtype = types.boolean if spec["dtype"] == "bool" else getattr(types, spec["dtype"])
        signature.append(types.Array(dtype, spec["ndim"], "C") if spec["ndim"] else dtype)
    ptx, _ = cuda.compile_ptx(namespace[kernel.name], tuple(signature), cc=(7, 0))
    entry = re.search(r"\.entry\s+(\w+)\s*\(", ptx)
    if not entry:
        raise RuntimeError("Numba did not return a kernel entry point.")
    return {"ptx": ptx, "entry": entry[1]}


def main():
    resource.setrlimit(resource.RLIMIT_AS, (2 << 30, 2 << 30))
    resource.setrlimit(resource.RLIMIT_CPU, (8, 9))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1 << 20, 1 << 20))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    try:
        request = json.loads(sys.stdin.buffer.read(65537))
        with redirect_stdout(sys.stderr):
            result = compile_request(request)
    except Exception as error:
        result = {"error": str(error)[:3000]}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
