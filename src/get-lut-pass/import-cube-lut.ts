import { writeTextureToCanvas } from "../write-texture-to-canvas";

const parseRgbPadded = (line: string) => {
  const [r, g, b] = line.split(" ").map(parseFloat);
  return [r * 255, g * 255, b * 255, 0];
};

const BUFFER_STRIDE = 4;

export const importCubeLut = async (device: GPUDevice, path: string) => {
  const response = await fetch(path);
  const text = await response.text();
  const colours = text.split("#LUT data points")[1];
  const lines = colours.split("\n").slice(1, -1);
  const rgb = lines.map(parseRgbPadded);
  const lutBuffer = device.createBuffer({
    label: "LUT buffer",
    size: rgb.length * BUFFER_STRIDE,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const lutTextureHeight = Math.ceil(Math.cbrt(rgb.length));
  const lutTextureWidth = Math.ceil(rgb.length / lutTextureHeight);
  const lutTexture = device.createTexture({
    size: {
      width: lutTextureWidth,
      height: lutTextureHeight,
    },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.TEXTURE_BINDING,
    dimension: "2d",
    mipLevelCount: 1,
  });
  const lutVolume = device.createTexture({
    size: {
      width: lutTextureHeight,
      height: lutTextureHeight,
      depthOrArrayLayers: lutTextureHeight,
    },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.TEXTURE_BINDING,
    dimension: "3d",
    mipLevelCount: 1,
  });
  rgb.forEach(([r, g, b, a], index) => {
    const data = new Uint8Array([r, g, b, a]);
    device.queue.writeBuffer(lutBuffer, BUFFER_STRIDE * index, data);
  });
  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToTexture(
    {
      buffer: lutBuffer,
      bytesPerRow: lutTextureWidth * BUFFER_STRIDE,
    },
    { texture: lutTexture },
    [lutTextureWidth, lutTextureHeight, 1],
  );
  for (let z = 0; z < lutVolume.depthOrArrayLayers; z++) {
    commandEncoder.copyTextureToTexture(
      {
        texture: lutTexture,
        mipLevel: 0,
        origin: { x: z * lutVolume.width, y: 0 },
      },
      {
        texture: lutVolume,
        mipLevel: 0,
        origin: { x: 0, y: 0, z },
      },
      {
        width: lutVolume.width,
        height: lutVolume.height,
      },
    );
  }
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  writeTextureToCanvas(
    device,
    "debug-canvas",
    lutTexture,
    lutTexture.createView(),
  );
  return lutVolume;
};
