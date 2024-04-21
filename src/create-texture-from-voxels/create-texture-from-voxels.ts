import { TVoxels } from "../convert-vxm";
import {
  writeToFloatUniformBuffer,
  writeToUniformBuffer,
} from "../buffer-utils";
import createTextureFromVoxelsCompute from "./create-texture-from-voxels.compute.wgsl";

type CreateTextureFromVoxels = {
  commandBuffer: GPUCommandBuffer;
  texture: GPUTexture;
};

/**
 * Create a command buffer for creating 3D texture from voxels
 * Command buffer must be submitted to the GPUQueue to execute
 * @param device GPUDevice used to create the texture
 * @param voxels TVoxels object containing the voxel data
 * @returns CreateTextureFromVoxels object containing the command buffer and texture
 */
export const createTextureFromVoxels = async (
  device: GPUDevice,
  voxels: TVoxels,
): Promise<GPUTexture> => {
  const texture = device.createTexture({
    size: {
      width: voxels.SIZE[0],
      height: voxels.SIZE[1],
      depthOrArrayLayers: voxels.SIZE[2],
    },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING,
    dimension: "3d",
    mipLevelCount: 3,
  });

  const voxelsBuffer = device.createBuffer({
    size: voxels.XYZI.length * 4 * 4,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE,
  });

  const paletteBuffer = device.createBuffer({
    size: voxels.RGBA.length * 4 * 4,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE,
  });

  writeToFloatUniformBuffer(
    paletteBuffer,
    voxels.RGBA.map((v) => [v.r / 255, v.g / 255, v.b / 255, v.a / 255]).flat(),
  );

  writeToUniformBuffer(
    voxelsBuffer,
    voxels.XYZI.map((v) => [v.x, v.y, v.z, v.c]).flat(),
  );

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: "write-only",
          format: texture.format,
          viewDimension: "3d",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: createTextureFromVoxelsCompute,
      }),
      entryPoint: "main",
    },
  });

  const bindGroup = device.createBindGroup({
    label: "create-texture-from-voxels",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: texture.createView({
          baseMipLevel: 0,
          mipLevelCount: 1,
        }),
      },
      {
        binding: 1,
        resource: {
          buffer: voxelsBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: paletteBuffer,
        },
      },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(voxels.XYZI.length / 64, 1, 1);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  return texture;
};
