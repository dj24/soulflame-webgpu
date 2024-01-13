import { Vec3 } from "wgpu-matrix";
import generateMips from "./generate-mips.wgsl";

export const nextPowerOf2 = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export const calculateNumMipLevels = ([width, height, depth]: Vec3): number => {
  const maxDimension = Math.max(width, height, depth);
  return Math.floor(Math.log2(maxDimension)) + 1;
};

export const createOctreeBuffer = async (
  device: GPUDevice,
  volumeTexture: GPUTexture,
) => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          viewDimension: "3d",
        },
      },
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: volumeTexture.createView(),
      },
    ],
  });
};
