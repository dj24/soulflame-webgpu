import { device } from "./app";

export const writeToUniformBuffer = (buffer: GPUBuffer, items: number[]) => {
  const uintArray = new Uint32Array(items);
  device.queue.writeBuffer(
    buffer,
    0, // offset
    uintArray.buffer,
    0, // data offset
    items.length * Uint32Array.BYTES_PER_ELEMENT,
  );
};
export const createUniformBuffer = (items: number[], label?: string) => {
  const uintArray = new Uint32Array(items);
  const buffer = device.createBuffer({
    size: uintArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label,
  });
  writeToUniformBuffer(buffer, items);
  return buffer;
};

export const writeToFloatUniformBuffer = (
  buffer: GPUBuffer,
  items: number[],
) => {
  const floatArray = new Float32Array(items);
  device.queue.writeBuffer(
    buffer,
    0, // offset
    floatArray.buffer,
    0, // data offset
    items.length * Float32Array.BYTES_PER_ELEMENT,
  );
};

export const createFloatUniformBuffer = (items: number[], label?: string) => {
  const floatArray = new Float32Array(items);
  const buffer = device.createBuffer({
    size: floatArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label,
  });
  writeToFloatUniformBuffer(buffer, items);
  return buffer;
};
