import computeBrickmap from "./brickmap.compute.wgsl";
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
 * @param volumeTexture - The volume texture to create the brickmap for.
 * @returns A promise that resolves to the brickmap buffer.
 */
export const createBrickMapFromTexture = async (
  device: GPUDevice,
  volumeTexture: GPUTexture,
): Promise<GPUBuffer> => {
  const bricksX = Math.ceil(volumeTexture.width / BRICK_SIZE);
  const bricksY = Math.ceil(volumeTexture.height / BRICK_SIZE);
  const bricksZ = Math.ceil(volumeTexture.depthOrArrayLayers / BRICK_SIZE);

  const totalBricks = bricksX * bricksY * bricksZ;

  const brickmapBuffer = device.createBuffer({
    size: totalBricks * BRICK_STRIDE_BYTES,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE,
  });

  console.log({ SIZE: totalBricks * BRICK_STRIDE_BYTES });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
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
        texture: {
          sampleType: "float",
          viewDimension: "3d",
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
      entryPoint: "texture",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 1,
        resource: {
          buffer: brickmapBuffer,
        },
      },
      {
        binding: 2,
        resource: volumeTexture.createView(),
      },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();

  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(Math.ceil(totalBricks / 64));
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  return brickmapBuffer;
};
