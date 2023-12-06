import { Vec3 } from "wgpu-matrix";
import { createTextureFromImage } from "webgpu-utils";

const ceilToNearestFactor = (value: number, factor: number) => {
  return Math.ceil(value / factor) * factor;
};

export const create3dTexture = async (
  device: GPUDevice,
  paths: string[],
  size: Vec3,
): Promise<GPUTexture> => {
  const [width, height, depth] = size;
  const texture = device.createTexture({
    size: { width, height, depthOrArrayLayers: depth },
    format: "rgba8unorm",
    usage: GPUTextureUsage.COPY_DST,
  });
  // TODO: figure out with all dimensions are + 1 bigger than they should be
  console.log({ size, paths });
  const commandEncoder = device.createCommandEncoder();
  for (let i = 0; i < depth; i++) {
    // console.log({ path: paths[i] });
    const sliceTexture = await createTextureFromImage(device, paths[i]);
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyTextureToTexture(
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
  }

  device.queue.submit([commandEncoder.finish()]);

  return texture;
};
