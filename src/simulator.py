"""Functional teaching model for the CUDA subset used by the browser labs."""

import ast
import builtins
import itertools
import math
import struct
from collections import Counter
from types import SimpleNamespace


def float32(value):
    return struct.unpack("f", struct.pack("f", value))[0]


def int32(value):
    return (int(value) + 2**31) % 2**32 - 2**31


def dim(values):
    return SimpleNamespace(x=values[0], y=values[1] if len(values) > 1 else 1)


class Buffer:
    def __init__(self, model, name, values, shape, cast, space="global"):
        self.model = model
        self.name = name
        self.values = list(values)
        self.shape = shape
        self.cast = cast
        self.space = space

    def offset(self, index):
        indices = index if isinstance(index, tuple) else (index,)
        if len(indices) != len(self.shape):
            raise IndexError(f"{self.name} expects {len(self.shape)} indices")
        offset = 0
        for position, extent in zip(indices, self.shape):
            if not isinstance(position, int) or not -extent <= position < extent:
                raise IndexError(f"{self.name}[{index}] is outside shape {self.shape}")
            offset = offset * extent + position % extent
        return offset

    def __getitem__(self, index):
        offset = self.offset(index)
        value = self.values[offset]
        if value is None:
            raise RuntimeError(f"{self.name}[{index}] read before it was initialized")
        self.model.record("read", self, index, offset, value)
        return value

    def __setitem__(self, index, value):
        offset = self.offset(index)
        value = self.cast(value)
        self.values[offset] = value
        self.model.record("write", self, index, offset, value)

    def atomic_add(self, index, increment):
        offset = self.offset(index)
        previous = self.values[offset]
        value = self.cast(previous + increment)
        self.values[offset] = value
        self.model.record("atomic", self, index, offset, value)
        return previous


class BarrierCompiler(ast.NodeTransformer):
    def visit_Expr(self, node):
        call = node.value
        if (
            isinstance(call, ast.Call)
            and isinstance(call.func, ast.Attribute)
            and isinstance(call.func.value, ast.Name)
            and call.func.value.id == "cuda"
            and call.func.attr == "syncthreads"
            and not call.args
            and not call.keywords
        ):
            # The site identifies the barrier. Loop iterations advance together.
            return ast.copy_location(ast.Expr(ast.Yield(ast.Constant(node.lineno))), node)
        return self.generic_visit(node)

    def visit_Attribute(self, node):
        if isinstance(node.value, ast.Name) and node.value.id == "cuda" and node.attr == "syncthreads":
            raise SyntaxError("Write cuda.syncthreads() on its own line.")
        return self.generic_visit(node)


class CudaModel:
    def __init__(self):
        self.events = []
        self.counts = Counter()
        self.shared = {}
        self.block = (0, 0)
        self.thread = (0, 0)
        self.phase = 0
        self.cuda = SimpleNamespace(
            jit=lambda function: function,
            grid=self.grid,
            shared=SimpleNamespace(array=self.shared_array),
            atomic=SimpleNamespace(add=lambda array, index, value: array.atomic_add(index, value)),
            syncthreads=None,
        )

    def grid(self, dimensions):
        x = self.cuda.blockIdx.x * self.cuda.blockDim.x + self.cuda.threadIdx.x
        if dimensions == 1:
            return x
        if dimensions == 2:
            y = self.cuda.blockIdx.y * self.cuda.blockDim.y + self.cuda.threadIdx.y
            return x, y
        raise ValueError("The browser model supports cuda.grid(1) and cuda.grid(2).")

    def shared_array(self, shape, dtype):
        import sys

        site = sys._getframe(1).f_lineno
        if site not in self.shared:
            shape = (shape,) if isinstance(shape, int) else tuple(shape)
            if not shape or any(not isinstance(extent, int) or extent < 1 for extent in shape):
                raise ValueError("Shared memory needs a positive shape.")
            size = math.prod(shape)
            if size > 16384:
                raise ValueError("The browser model limits one shared array to 16,384 elements.")
            self.shared[site] = Buffer(self, f"shared:{site}", [None] * size, shape, dtype, "shared")
        return self.shared[site]

    def record(self, action, buffer=None, index=None, offset=None, value=None):
        space = buffer.space if buffer else "block"
        self.counts[f"{space}_{action}"] += 1
        if len(self.events) >= 6000:
            return
        event = {
            "block": self.block, "thread": self.thread, "phase": self.phase,
            "action": action, "space": space,
        }
        if buffer is not None:
            event.update({
                "buffer": buffer.name, "index": index, "offset": offset,
                "value": display_value(value),
            })
        self.events.append(event)

    def select_thread(self, x, y):
        self.thread = (x, y)
        self.cuda.threadIdx = dim(self.thread)

    def launch(self, kernel, args, blocks, threads):
        grid, block = dim(blocks), dim(threads)
        self.cuda.gridDim = grid
        self.cuda.blockDim = block
        for by, bx in itertools.product(range(grid.y), range(grid.x)):
            self.block = (bx, by)
            self.phase = 0
            self.cuda.blockIdx = dim(self.block)
            self.shared = {}
            running = []
            for ty, tx in itertools.product(range(block.y), range(block.x)):
                self.select_thread(tx, ty)
                generator = kernel(*args)
                if generator is not None:
                    running.append((tx, ty, generator))
            self.advance_block(running)

    def advance_block(self, running):
        while running:
            waiting = []
            barrier_sites = set()
            for tx, ty, generator in running:
                self.select_thread(tx, ty)
                try:
                    barrier_sites.add(next(generator))
                except StopIteration:
                    continue
                self.record("barrier")
                waiting.append((tx, ty, generator))
            if waiting and (len(waiting) != len(running) or len(barrier_sites) != 1):
                raise RuntimeError("Threads in this block reached different barriers, or some returned before the barrier.")
            self.phase += 1
            running = waiting


def display_value(value):
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    return value


def run_lab(source, fixture, filename="kernel.py"):
    model = CudaModel()
    numba = SimpleNamespace(cuda=model.cuda, float32=float32, int32=int32)

    def import_kernel_module(name, globals=None, locals=None, fromlist=(), level=0):
        if level == 0 and name == "numba":
            return numba
        if level == 0 and name == "math":
            return math
        raise ImportError(f"The browser kernel model only provides numba and math (requested {name}).")

    sandbox_builtins = {
        **{name: getattr(builtins, name) for name in (
            "abs", "bool", "enumerate", "float", "int", "len", "max", "min",
            "print", "range", "round", "sum", "tuple", "ValueError", "RuntimeError", "IndexError",
        )},
        "__import__": import_kernel_module,
    }
    namespace = {"__builtins__": sandbox_builtins}
    tree = ast.fix_missing_locations(BarrierCompiler().visit(ast.parse(source, filename=filename)))
    exec(compile(tree, filename, "exec"), namespace)
    buffers = {}
    for name, spec in fixture["buffers"].items():
        buffers[name] = Buffer(
            model, name, spec["values"], spec["shape"],
            int32 if spec["dtype"] == "int32" else float32,
        )
    inputs = fixture["scalars"] | buffers
    model.launch(namespace["kernel"], [inputs[name] for name in fixture["args"]], fixture["blocks"], fixture["threads"])
    output = buffers[fixture["output"]]
    expected = fixture["expected"]
    mismatches = []
    for i, (actual, wanted) in enumerate(zip(output.values, expected, strict=True)):
        if not math.isclose(actual, wanted, rel_tol=1e-5, abs_tol=1e-6):
            mismatches.append(i)
    return {
        "output": [display_value(value) for value in output.values],
        "shape": output.shape, "expected": expected, "mismatches": mismatches,
        "events": model.events, "counts": dict(model.counts),
        "truncated": sum(model.counts.values()) > len(model.events),
    }
