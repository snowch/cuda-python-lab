import { migrateCudaImports } from "./source-migration.mjs";
function markdown(source) {
  return { cell_type: "markdown", metadata: {}, source };
}

function code(source) {
  return { cell_type: "code", metadata: {}, source, execution_count: null, outputs: [] };
}

const install = '%pip install "numba-cuda-mlir[cu12]==0.6.0" "numpy>=1.26,<2.5"\n';

const checkGpu = `from numba_cuda_mlir import cuda

if not cuda.is_available():
    raise RuntimeError("Select an NVIDIA GPU runtime and restart the kernel.")
if cuda.get_current_device().compute_capability < (7, 0):
    raise RuntimeError("This compiler requires an NVIDIA GPU with compute capability 7.0 or later.")
`;

function checkOutput(fixture) {
  const { shape, dtype } = fixture.buffers[fixture.output];
  return `import numpy as np

expected = np.array(${JSON.stringify(fixture.expected)}, dtype=np.${dtype}).reshape(${shape.join(", ")})
result = globals().get("actual")
if result is None:
    print("Return your result from main() and assign it to actual to use this check.")
else:
    result = np.asarray(result)
    if result.shape == expected.shape:
        matches = np.${dtype === "int32" ? "equal(result, expected)" : "isclose(result, expected, rtol=1e-5, atol=1e-6)"}
        print(f"{np.count_nonzero(matches)} of {expected.size} values match the starter reference.")
    else:
        print(f"Your result has shape {result.shape}. The starter result has shape {expected.shape}.")
`;
}

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

**Case** · ${fixture.label}

${lesson.predict}

Run the cells in order on an NVIDIA GPU. In Google Colab, choose **Runtime → Change runtime type** and select a GPU. In Jupyter, use a Python environment on a machine with an NVIDIA GPU.${lesson.cases.length > 1 ? " To use another case, select it on the lesson page and download its notebook." : ""}

${lesson.exercise.map((step, index) => `${index + 1}. ${step}`).join("\n")}`),
      code(install),
      code(checkGpu),
      markdown("## Run the program\n\nThe program below includes both the CUDA kernel and the CPU code that launches it."),
      code(migrateCudaImports(source)),
      markdown("## Check the output\n\nCompare with the expected result for the original code and selected case. Changes to the program can change the result."),
      code(checkOutput(fixture)),
      markdown(`## Explain the result\n\n${lesson.explain}\n\n${lesson.native}`),
    ],
  };
}
