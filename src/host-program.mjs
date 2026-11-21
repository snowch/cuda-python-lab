const launchDimension = (dimensions) => dimensions.length === 1
  ? String(dimensions[0]) : `(${dimensions.join(", ")})`;

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
  const arrays = Object.entries(buffers).map(([name, spec]) =>
    `    ${name}_host = ${hostArray(spec)}\n    ${name} = cuda.to_device(${name}_host)`);
  const argumentsList = args.map((name) => {
    if (Object.hasOwn(buffers, name)) return name;
    const value = scalars[name];
    return Number.isInteger(value) ? value : `np.float32(${value})`;
  });
  return `def main():
    import numpy as np
    from numba import cuda

${arrays.join("\n\n")}

    kernel[${launchDimension(blocks)}, ${launchDimension(threads)}](${argumentsList.join(", ")})
    result = ${output}.copy_to_host()
    print("${output} =", result.tolist())


if __name__ == "__main__":
    main()
`;
}

export function standaloneProgram(source, fixture) {
  return `${source.trimEnd()}\n\n\n${hostProgram(fixture)}`;
}
