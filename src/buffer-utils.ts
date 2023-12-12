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
  items: number[] | Float32Array,
) => {
  if (items instanceof Float32Array) {
    device.queue.writeBuffer(
      buffer,
      0, // offset
      items.buffer,
      0, // data offset
      items.length * Float32Array.BYTES_PER_ELEMENT,
    );
  } else{
    const floatArray = new Float32Array(items);
    device.queue.writeBuffer(
      buffer,
      0, // offset
      floatArray.buffer,
      0, // data offset
      items.length * Float32Array.BYTES_PER_ELEMENT,
    );
  }
};

export const createFloatUniformBuffer = (device: GPUDevice, items: number[], label?: string) => {
  const floatArray = new Float32Array(items);
  const buffer = device.createBuffer({
    size: floatArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label,
  });
  writeToFloatUniformBuffer(buffer, items);
  return buffer;
};
