"""Provide the llvmlite binding API imported by Numba's CUDA frontend."""

from types import SimpleNamespace


llvm_version_info = (22, 1, 0)


def _unused_cpu_hook(*_):
    pass


check_jit_execution = initialize_native_target = initialize_native_asmprinter = add_symbol = _unused_cpu_hook
ffi = SimpleNamespace(register_lock_callback=_unused_cpu_hook)
newpassmanagers = SimpleNamespace(dump_refprune_stats=lambda: 0)


def get_default_triple():
    return "nvptx64-nvidia-cuda"


def create_target_data(layout):
    # wasm-numba.py supplies sizes and alignments for this target.
    return layout


class ExecutionEngine:
    def _unsupported(*_):
        raise RuntimeError("This Numba build compiles CUDA kernels only.")

    set_object_cache = finalize_object = get_function_address = get_global_value_address = _unsupported
