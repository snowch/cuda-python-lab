const launchDimension = (dimensions) => dimensions.length === 1
  ? String(dimensions[0]) : `(${dimensions.join(", ")})`;
const hostMarker = "\n# Host code\n";

function hostArray({ values, shape, dtype }) {
  const suffix = `dtype=np.${dtype})${shape.length === 1 ? "" : `.reshape(${shape.join(", ")})`}`;
  if (values.every((value) => value === 0)) {
    return `np.zeros(${launchDimension(shape)}, dtype=np.${dtype})`;
  }
  if (values.length <= 8) return `np.array([${values.join(", ")}], ${suffix}`;

  const rows = [];
  for (let start = 0; start < values.length; start += 8) {
    rows.push(`        ${values.slice(start, start + 8).join(", ")},`);
  }
  return `np.array([\n${rows.join("\n")}\n    ], ${suffix}`;
}

export function hostProgram(fixture) {
  const { buffers, args, scalars, blocks, threads, output } = fixture;
  const arrays = Object.entries(buffers).map(([name, spec]) => {
    if (name === output && fixture.allocateOutput) {
      return `    ${name} = cuda.device_array(${launchDimension(spec.shape)}, dtype=np.${spec.dtype})`;
    }
    return `    ${name}_host = ${hostArray(spec)}\n    ${name} = cuda.to_device(${name}_host)`;
  });
  const argumentsList = args.map((name) => {
    if (Object.hasOwn(buffers, name)) return name;
    const value = scalars[name];
    return Number.isInteger(value) ? value : `np.float32(${value})`;
  });
  return `def main():
    import numpy as np
    from numba_cuda_mlir import cuda

${arrays.join("\n\n")}

    kernel[${launchDimension(blocks)}, ${launchDimension(threads)}](${argumentsList.join(", ")})
    result = ${output}.copy_to_host()
    print("${output} =", result.tolist())
    return result


if __name__ == "__main__":
    actual = main()
`;
}

export function joinProgram(kernel, host) {
  return `${kernel.trimEnd()}\n\n${hostMarker}${host}`;
}

export function splitProgram(source) {
  const marker = source.lastIndexOf(hostMarker);
  if (marker < 0) return null;
  return {
    kernel: source.slice(0, marker).trimEnd() + "\n",
    host: source.slice(marker + hostMarker.length),
  };
}

export function standaloneProgram(kernel, fixture) {
  return joinProgram(kernel, hostProgram(fixture));
}

export function programExcerpt(program, { from, through = from }) {
  const lines = program.split("\n");
  const first = lines.findIndex((line) => line.trim() === from);
  const last = lines.findIndex((line, index) => index >= first && line.trim() === through);
  if (first < 0 || last < 0) throw new Error(`Missing starter code excerpt from "${from}" through "${through}".`);
  const indent = lines[first].search(/\S/);
  return lines.slice(first, last + 1).map((line) => line.slice(indent)).join("\n");
}
