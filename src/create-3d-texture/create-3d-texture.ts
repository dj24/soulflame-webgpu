import { Vec3 } from "wgpu-matrix";
import { createTextureFromImage } from "webgpu-utils";
export const nextPowerOf2 = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export const calculateNumMipLevels = ([width, height, depth]: Vec3): number => {
  const maxDimension = Math.max(width, height, depth);
  return Math.floor(Math.log2(maxDimension)) + 1;
};

const VOLUME_TEXTURE_FORMAT = "rgba8unorm";

export const create3dTexture = async (
  device: GPUDevice,
  paths: string[],
  size: Vec3,
  label?: string,
): Promise<GPUTexture> => {
  const [width, height, depth] = size;

  const volumeTexture = device.createTexture({
    size: { width, height, depthOrArrayLayers: depth },
    format: VOLUME_TEXTURE_FORMAT,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
    dimension: "3d",
    label,
    mipLevelCount: 1,
  });

  const commandEncoder = device.createCommandEncoder();

  await Promise.all(
    paths.map(async (path, i) => {
      try {
        const sliceTexture = await createTextureFromImage(device, path, {
          usage: GPUTextureUsage.COPY_SRC,
          mips: false,
        });
        commandEncoder.copyTextureToTexture(
          {
            texture: sliceTexture,
            mipLevel: 0, // Assuming mip level 0 for simplicity
            origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
          },
          {
            texture: volumeTexture,
            mipLevel: 0, // Assuming mip level 0 for simplicity
            origin: { x: 0, y: 0, z: i }, // Specify the destination origin (z-axis slice)
          },
          {
            width: sliceTexture.width,
            height: sliceTexture.height,
            depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
          },
        );
      } catch (e) {
        console.log(`Error creating texture from image at ${path}: ${e}`);
      }
    }),
  );

  device.queue.submit([commandEncoder.finish()]);

  return volumeTexture;
};
