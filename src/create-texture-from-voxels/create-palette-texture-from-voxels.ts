import { TVoxels } from "../convert-vxm";

/**
 * Creates a palette texture from a TVoxels object\
 */
export const createPaletteTextureFromVoxels = async (
  device: GPUDevice,
  voxels: TVoxels,
) => {
  const texture = device.createTexture({
    size: {
      width: 256,
      height: 1,
    },
    format: "rgba8unorm",
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    dimension: "2d",
    mipLevelCount: 1,
  });

  const paletteBuffer = device.createBuffer({
    label: "palette buffer",
    size: 256 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  voxels.RGBA.forEach(({ r, g, b, a }, index) => {
    const data = new Uint8Array([r, g, b, a]);
    device.queue.writeBuffer(paletteBuffer, 4 * index, data);
  });

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToTexture(
    { buffer: paletteBuffer },
    { texture },
    [255, 1, 1],
  );

  device.queue.submit([commandEncoder.finish()]);
  return texture;
};
