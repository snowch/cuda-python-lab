import createModuleSimulator from "./runtime/gpgpu-sim.mjs";

const encode = (value) => new TextEncoder().encode(value + "\0");
const bufferLimit = 8 * 1024 * 1024;
const maxThreads = 4096;

export function compatiblePtx(ptx) {
  // Kernels are linked one module at a time. The Wasm parser accepts the
  // global declaration and preserves double literals through their raw bits.
  return ptx.replace(/^\.common /gm, "")
    .replace(/mov\.f64\s+(%fd\d+),\s*0d([a-f0-9]{8})([a-f0-9]{8});/gi,
      (_, register, high, low) => `{ .reg .b32 %lab_literal_low, %lab_literal_high;
        mov.b32 %lab_literal_low, 0x${low};
        mov.b32 %lab_literal_high, 0x${high};
        mov.b64 ${register}, {%lab_literal_low, %lab_literal_high}; }`);
}

export function openDevice(wasmModule, compile, status) {
  const trace = [];
  function log(line) {
    trace.push(line);
    if (trace.length > 12) trace.shift();
  }
  const buffers = [];
  const compiled = new Map();
  const ptxModules = [];
  let bytesAllocated = 0;
  let launched = 0;
  let activePtx;
  let module;

  function temporary(bytes, use) {
    const pointer = module._malloc(Math.max(1, bytes.length));
    if (!pointer) throw new Error("GPGPU-Sim could not allocate temporary storage.");
    try {
      module.HEAPU8.set(bytes, pointer);
      return use(pointer);
    } finally {
      module._free(pointer);
    }
  }

  function address(buffer) {
    if (buffer.pointer === undefined) {
      buffer.pointer = module._allocate_buffer(Math.max(1, buffer.data.length)) >>> 0;
      if (!buffer.pointer) throw new Error("Device allocation failed.");
      if (buffer.data.length) temporary(buffer.data, (pointer) =>
        module._upload_buffer(buffer.pointer, pointer, buffer.data.length));
    }
    return buffer.pointer;
  }

  function readBack(buffer) {
    if (buffer.pointer && buffer.data.length) temporary(buffer.data, (pointer) => {
      module._download_buffer(pointer, buffer.pointer, buffer.data.length);
      buffer.data.set(module.HEAPU8.subarray(pointer, pointer + buffer.data.length));
    });
  }

  function linked(request) {
    const key = JSON.stringify(request);
    if (!compiled.has(key)) {
      status("Compiling CUDA with Numba…");
      compiled.set(key, compile(request));
    }
    const { ptx, entry } = compiled.get(key);
    if (ptx !== activePtx) {
      status("Loading PTX into GPGPU-Sim…");
      for (const buffer of buffers) {
        readBack(buffer);
        buffer.pointer = undefined;
      }
      trace.length = 0;
      activePtx = undefined;
      module = createModuleSimulator({ wasmModule, print: log, printErr: log });
      if (temporary(encode(compatiblePtx(ptx)), (pointer) => module._load_module(pointer))) {
        throw new Error("GPGPU-Sim rejected the compiled PTX.");
      }
      activePtx = ptx;
      if (!ptxModules.includes(ptx)) ptxModules.push(ptx);
    }
    return entry;
  }

  function argumentsPacket(args) {
    const count = args.length;
    const packet = new Uint8Array(Math.max(16, 16 * count));
    const view = new DataView(packet.buffer);
    let offset = 0;
    let i = 0;
    function add(value, bytes = 8) {
      offset = Math.ceil(offset / bytes) * bytes;
      view.setBigUint64(i * 8, BigInt.asUintN(64, BigInt(value)), true);
      view.setUint32(count * 8 + i * 4, bytes, true);
      view.setUint32(count * 12 + i * 4, offset, true);
      offset += bytes;
      i++;
    }
    for (const arg of args) add(arg.value, arg.bytes);
    return packet;
  }

  return {
    allocate(data) {
      bytesAllocated += data.length;
      if (bytesAllocated > bufferLimit) throw new Error("Use at most 8 MiB of device arrays per browser run.");
      buffers.push({ data: new Uint8Array(data) });
      return buffers.length - 1;
    },
    upload(id, data) {
      const buffer = buffers[id];
      if (data.length !== buffer.data.length) throw new Error("The array sizes must match.");
      buffer.data.set(data);
      if (buffer.pointer && data.length) temporary(data, (pointer) =>
        module._upload_buffer(buffer.pointer, pointer, data.length));
    },
    read(id) {
      const buffer = buffers[id];
      readBack(buffer);
      return buffer.data.slice();
    },
    launch(json) {
      const { source, kernel, signature, args, grid, block } = JSON.parse(json);
      const product = (values) => values.reduce((n, part) => n * part, 1);
      if (product(block) > 1024 || product(grid) * product(block) > maxThreads) {
        throw new Error("Launch up to 1,024 threads per block and 4,096 threads per browser launch.");
      }
      try {
        const entry = linked({ source, kernel, signature });
        const slots = args.flatMap((arg) => arg.buffer === undefined ? [arg] : [
          { value: 0 }, { value: 0 }, { value: arg.elements }, { value: arg.itemsize },
          { value: address(buffers[arg.buffer]) }, ...arg.shape.map((value) => ({ value })),
          ...arg.strides.map((value) => ({ value })),
        ]);
        const count = slots.length;
        const packet = argumentsPacket(slots);
        status("Running PTX in GPGPU-Sim…");
        const result = temporary(encode(entry), (label) => temporary(packet, (pointer) =>
          module._launch_kernel(label, pointer, pointer + 8 * count, pointer + 12 * count, count, ...grid, ...block)));
        if (result) throw new Error("GPGPU-Sim could not launch this kernel.");
        launched++;
      } catch (error) {
        if (!(error instanceof WebAssembly.RuntimeError)) throw error;
        const report = trace.filter((line) => line.trim()).slice(-6).join("\n").slice(0, 1800);
        throw new Error(`GPGPU-Sim could not execute this PTX.\n${report}`, { cause: error });
      }
    },
    report() {
      return { ptx: ptxModules.join("\n"), launched };
    },
  };
}
