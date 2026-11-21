"""Lower a validated kernel with Numba in Pyodide and return NVPTX64 LLVM IR."""

import json
import os
from pathlib import Path
import sysconfig
from types import SimpleNamespace
import warnings


os.environ["NUMBA_DISABLE_INTEL_SVML"] = "1"
os.environ["NUMBA_CPU_NAME"] = "generic"

# Numba derives intp from the Python process. CUDA pointers and the Numba
# array ABI are 64-bit even though the frontend runs in wasm32.
config_file = Path(sysconfig.get_paths()["purelib"]) / "numba/core/config.py"
config_source = config_file.read_text()
machine_bits = "MACHINE_BITS = tuple.__itemsize__ * 8"
if machine_bits not in config_source:
    raise RuntimeError("This Numba version needs an updated NVPTX64 configuration.")
config_file.write_text(config_source.replace(machine_bits, "MACHINE_BITS = 64"))

from llvmlite import ir
from numba import typed, types
from compile_kernel import BUILTINS, prepare_kernel


class UnavailableCPUContainer:
    def __init__(self, *_args, **_kwargs):
        raise NotImplementedError("Typed containers need the Numba CPU runtime.")


# CUDA extension discovery imports these names. Loading their CPU JIT
# implementations would require the native llvmlite execution engine.
typed.Dict = typed.List = typed.Set = UnavailableCPUContainer

from numba.cuda.compiler import compile_cuda
from numba.cuda import dispatcher
from numba.cuda.cudadrv import nvvm
from numba.extending import intrinsic


COMPUTE_CAPABILITY = (7, 0)
dispatcher.get_current_device = lambda: SimpleNamespace(compute_capability=COMPUTE_CAPABILITY)
nvvm.NVVM = lambda: SimpleNamespace(data_layout=nvvm._datalayout_i128, get_ir_version=lambda: (2, 0, 3, 1))


def round_up(size, alignment):
    return (size + alignment - 1) // alignment * alignment


def gpu_layout(dtype):
    if isinstance(dtype, ir.PointerType):
        return 8, 8
    if isinstance(dtype, ir.IntType):
        size = max(1, (dtype.width + 7) // 8)
        alignment = 1 << (size - 1).bit_length()
        return round_up(size, alignment), alignment
    if isinstance(dtype, ir.HalfType):
        return 2, 2
    if isinstance(dtype, ir.FloatType):
        return 4, 4
    if isinstance(dtype, ir.DoubleType):
        return 8, 8
    if isinstance(dtype, ir.ArrayType):
        size, alignment = gpu_layout(dtype.element)
        return size * dtype.count, alignment
    if isinstance(dtype, ir.BaseStructType):
        size, alignment = 0, 1
        for member in dtype.elements:
            stride, member_alignment = gpu_layout(member)
            if dtype.packed:
                member_alignment = 1
            size = round_up(size, member_alignment) + stride
            alignment = max(alignment, member_alignment)
        return round_up(size, alignment), alignment
    raise ValueError(f"Unsupported NVPTX64 ABI type {dtype}.")


ir.Type.get_abi_size = lambda self, *_: gpu_layout(self)[0]
ir.Type.get_abi_alignment = lambda self, *_: gpu_layout(self)[1]


def binary_extreme(operator):
    # Legacy Numba's variadic device overload needs a native dispatcher.
    # Compare the two values directly, preserving the first on ties or NaN.
    @intrinsic(target="cuda")
    def extreme(typing_context, left, right):
        result = typing_context.unify_pairs(left, right)
        if not isinstance(result, (types.Integer, types.Float, types.Boolean)):
            return None

        def select(context, builder, signature, operands):
            first, second = (
                context.cast(builder, value, dtype, result)
                for value, dtype in zip(operands, signature.args)
            )
            if isinstance(result, types.Float):
                take_second = builder.fcmp_ordered(operator, second, first)
            elif getattr(result, "signed", False):
                take_second = builder.icmp_signed(operator, second, first)
            else:
                take_second = builder.icmp_unsigned(operator, second, first)
            return builder.select(take_second, second, first)

        return result(left, right), select
    return extreme


CUDA_BUILTINS = {**BUILTINS, "min": binary_extreme("<"), "max": binary_extreme(">")}


def lower_kernel(request_json):
    function, signature = prepare_kernel(json.loads(request_json), CUDA_BUILTINS)
    with warnings.catch_warnings():
        # Pyodide's host hash uses FNV. The CUDA kernel subset has no hash operations.
        warnings.filterwarnings("ignore", message="FNV hashing is not implemented in Numba",
                                module=r"numba\.cpython\.hashing")
        lowered = compile_cuda(function, types.void, signature, cc=COMPUTE_CAPABILITY)
    kernel = lowered.library.get_function(lowered.fndesc.llvm_func_name)

    # A CUDA entry returns void. The frontend's device function also has an
    # implicit result pointer and returns a status. Remove both at the entry
    # so NVPTX does not need a wrapper that passes a local-memory pointer.
    result_pointer = kernel.args[0]
    for block in kernel.blocks:
        block.instructions[:] = [
            instruction for instruction in block.instructions
            if not (isinstance(instruction, ir.StoreInstr) and instruction.operands[1] is result_pointer)
        ]
        if isinstance(block.terminator, ir.Ret):
            block.instructions.pop()
            block.terminator = None
            ir.IRBuilder(block).ret_void()
    kernel.args = kernel.args[1:]
    kernel.ftype = ir.FunctionType(ir.VoidType(), [argument.type for argument in kernel.args])
    kernel.type = kernel.ftype.as_pointer()
    kernel.return_value = ir.ReturnValue(kernel, ir.VoidType())
    nvvm.set_cuda_kernel(kernel)

    # Device helpers generated by Numba are separate IR modules. Resolve their
    # declarations and unique metadata numbers before handing IR to LLVM.
    linked, *helpers = lowered.library.modules
    for helper in helpers:
        for name, item in helper.globals.items():
            existing = linked.globals.get(name)
            if existing is None or (getattr(existing, "is_declaration", False)
                                    and not getattr(item, "is_declaration", False)):
                linked.globals[name] = item
        for node in helper.metadata:
            node.name = str(len(linked.metadata))
            node._clear_string_cache()
            linked.metadata.append(node)
    return str(linked)
