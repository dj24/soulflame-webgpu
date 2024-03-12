import { TVoxels } from "../convert-vxm";
import {
  writeToFloatUniformBuffer,
  writeToUniformBuffer,
} from "../buffer-utils";
import createTextureFromVoxelsCompute from "./create-texture-from-voxels.wgsl";

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

  writeToUniformBuffer(
    paletteBuffer,
    voxels.RGBA.map((v) => [v.r, v.g, v.b, v.a]).flat(),
  );

  writeToFloatUniformBuffer(
    voxelsBuffer,
    voxels.XYZI.map((v) => [v.x / 255, v.y / 255, v.z / 255, v.c / 255]).flat(),
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
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: texture.createView(),
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
  passEncoder.dispatchWorkgroups(voxels.XYZI.length / 64);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  return texture;
};
