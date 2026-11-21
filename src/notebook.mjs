function markdown(source) {
  return { cell_type: "markdown", metadata: {}, source };
}

function code(source) {
  return { cell_type: "code", metadata: {}, source, execution_count: null, outputs: [] };
}

const setup = `import json
from time import perf_counter

import numpy as np
from numba import cuda

if not cuda.is_available():
    raise RuntimeError("Select an NVIDIA GPU runtime and restart the kernel.")
`;

const hostSetup = `host = {
    name: np.asarray(spec["values"], dtype=spec["dtype"]).reshape(spec["shape"])
    for name, spec in case["buffers"].items()
}
scalars = case["scalars"].copy()
for name, value in scalars.items():
    if isinstance(value, float):
        scalars[name] = np.float32(value)
blocks, threads = case["blocks"], case["threads"]
output_name = case["output"]

def launch(device):
    args = [device[name] if name in device else scalars[name] for name in case["args"]]
    kernel[tuple(blocks), tuple(threads)](*args)

device = {name: cuda.to_device(array) for name, array in host.items()}
launch(device)
actual = device[output_name].copy_to_host()
`;

const measure = `# A fresh launch needs fresh initial state for kernels that update the output.
# Reset it ahead of each CUDA event so the kernel-only timing excludes the reset.
start, stop = cuda.event(), cuda.event()
kernel_times = []
for _ in range(30):
    if case.get("resetOutput"):
        device[output_name].copy_to_device(host[output_name])
    start.record()
    launch(device)
    stop.record()
    stop.synchronize()
    kernel_times.append(cuda.event_elapsed_time(start, stop))

# Reuse allocated device buffers. Include both transfer directions and the
# host-side cost of launching and waiting for the work.
round_trip_times = []
copy = np.empty_like(host[output_name])
for _ in range(30):
    before = perf_counter()
    for name, array in host.items():
        if name != output_name or case.get("resetOutput"):
            device[name].copy_to_device(array)
    launch(device)
    device[output_name].copy_to_host(copy)
    round_trip_times.append(1e3 * (perf_counter() - before))

print(f"Median kernel time:     {np.median(kernel_times):.4f} ms")
print(f"Median round-trip time: {np.median(round_trip_times):.4f} ms")
`;

export function makeNotebook(lesson, source, fixture) {
  return {
    nbformat: 4,
    nbformat_minor: 2,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
      accelerator: "GPU",
    },
    cells: [
      markdown(`# ${lesson.title}

${lesson.summary}

Run this notebook on an NVIDIA GPU. In a hosted notebook, enable a GPU runtime first.
For a local environment, use the [Numba CUDA installation guide](https://nvidia.github.io/numba-cuda/user/installation.html).

**Investigation.** ${lesson.native}
`),
      code('%pip install "numba-cuda[cu12]==0.30.4" "numpy>=1.26,<2.5"\n'),
      code(setup),
      markdown("## Kernel\n\nThis cell contains the Python source from the browser editor."),
      code(source),
      markdown(`## Run and verify\n\nCase: ${fixture.label}. Compare the complete GPU output with a NumPy reference.`),
      code(`case = json.loads(${JSON.stringify(JSON.stringify(fixture))})\n\n${hostSetup}
expected = ${lesson.reference}
${fixture.buffers[fixture.output].dtype === "int32"
  ? "np.testing.assert_array_equal(actual, expected)"
  : "np.testing.assert_allclose(actual, expected, rtol=1e-5, atol=1e-6)"}
print("Verified", actual.shape)
print(actual)
`),
      markdown("## Measure on hardware\n\nThe verification launch warmed up compilation. CUDA events time work on the device. The host timer includes copies and waiting. These tiny arrays are good for checking correctness. Increase the size and repeat the measurement to study throughput."),
      code(measure),
    ],
  };
}
