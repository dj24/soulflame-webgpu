import { device } from "./app";

//TODO: add check to allow for arrays or individual values to be passed
export const createUniformBuffer = (items: number[], label?: string) => {
  const uintArray = new Uint32Array(items);
  const buffer = device.createBuffer({
    size: uintArray.byteLength, // TODO: figure out why this needs to be 64
    mappedAtCreation: true,
    usage: GPUBufferUsage.UNIFORM,
    label,
  });
  const mappedRange = new Uint32Array(buffer.getMappedRange());
  items.forEach((item, index) => {
    mappedRange[index] = item;
  });
  buffer.unmap();
  return buffer;
};

export const createFloatUniformBuffer = (items: number[], label?: string) => {
  const floatArray = new Float32Array(items);
  const buffer = device.createBuffer({
    size: Math.max(64, floatArray.byteLength), // TODO: figure out why this needs to be 64
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    buffer,
    0, // offset
    floatArray.buffer,
    0, // data offset
    items.length * Float32Array.BYTES_PER_ELEMENT,
  );
  return buffer;
};
