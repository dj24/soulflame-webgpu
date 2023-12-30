import { Vec3 } from "wgpu-matrix";
import { createTextureFromImage } from "webgpu-utils";

export const create3dTexture = async (
  device: GPUDevice,
  paths: string[],
  size: Vec3,
  label?: string,
): Promise<GPUTexture> => {
  const [width, height, depth] = size;
  const texture = device.createTexture({
    size: { width, height, depthOrArrayLayers: depth },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
    dimension: "3d",
    label,
  });

  const commandEncoder = device.createCommandEncoder();

  for (let i = 0; i < depth; i++) {
    try {
      const sliceTexture = await createTextureFromImage(device, paths[i], {
        usage: GPUTextureUsage.COPY_SRC,
      });
      commandEncoder.copyTextureToTexture(
        {
          texture: sliceTexture,
          mipLevel: 0, // Assuming mip level 0 for simplicity
          origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
        },
        {
          texture,
          mipLevel: 0, // Assuming mip level 0 for simplicity
          origin: { x: 0, y: 0, z: i }, // Specify the destination origin (z-axis slice)
        },
        {
          width: texture.width,
          height: texture.height,
          depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
        },
      );
    } catch (e) {
      console.log(`Error creating texture from image at ${paths[i]}: ${e}`);
    }
  }

  device.queue.submit([commandEncoder.finish()]);

  return texture;
};
