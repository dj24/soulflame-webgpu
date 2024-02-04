import { Vec3 } from "wgpu-matrix";
import { createTextureFromImage, numMipLevels } from "webgpu-utils";
export const nextPowerOf2 = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

const VOLUME_TEXTURE_FORMAT = "rgba8unorm";

export const create3dTexture = async (
  device: GPUDevice,
  paths: string[],
  size: Vec3,
  label?: string,
): Promise<GPUTexture> => {
  console.log(`Creating 3D texture with size: ${size}, label: ${label}`);
  const width = nextPowerOf2(size[0]);
  const height = nextPowerOf2(size[1]);
  const depth = nextPowerOf2(size[2]);
  const mipLevelCount = numMipLevels(
    { width, height, depthOrArrayLayers: depth },
    "3d",
  );

  const volumeTexture = device.createTexture({
    size: { width, height, depthOrArrayLayers: depth },
    format: VOLUME_TEXTURE_FORMAT,
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.STORAGE_BINDING,
    dimension: "3d",
    label,
    mipLevelCount,
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
  await device.queue.onSubmittedWorkDone();

  return volumeTexture;
};
