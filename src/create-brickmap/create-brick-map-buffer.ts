import computeBrickmap from "./brickmap.wgsl";
import { TVoxels } from "../convert-vxm";
import { writeToUniformBuffer } from "../buffer-utils";

const BRICK_SIZE = 8;
// 8x8x8 voxels per brick, 1 bit per voxel
// 512 bits per brick, 64 bytes
const BRICK_STRIDE_BYTES = 64;

/**
 * Create a brickmap for the given voxels.
 * Bricks contain a bitmask for 8x8x8 voxels each.
 * @param device - The GPU device.
 * @param voxels - The voxels to create the brickmap for.
 * @returns A promise that resolves to the brickmap buffer.
 */
export const createBrickMapBuffer = async (
  device: GPUDevice,
  voxels: TVoxels,
): Promise<GPUBuffer> => {
  const voxelsBuffer = device.createBuffer({
    size: voxels.XYZI.length * 4 * 4,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE,
  });
  writeToUniformBuffer(
    voxelsBuffer,
    voxels.XYZI.map((v) => [v.x, v.y, v.z, v.c]).flat(),
  );

  const totalBricks =
    Math.ceil(voxels.SIZE[0] / BRICK_SIZE) *
    Math.ceil(voxels.SIZE[1] / BRICK_SIZE) *
    Math.ceil(voxels.SIZE[2] / BRICK_SIZE);

  const brickmapBuffer = device.createBuffer({
    size: totalBricks * BRICK_STRIDE_BYTES,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: computeBrickmap,
      }),
      entryPoint: "main",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: voxelsBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: brickmapBuffer,
        },
      },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(totalBricks / 64);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  return brickmapBuffer;
};
