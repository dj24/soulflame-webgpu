import { Vec3 } from "wgpu-matrix";
import generateMips from "./generate-octree.compute.wgsl";

export const nextPowerOf2 = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export const calculateNumMipLevels = ([width, height, depth]: Vec3): number => {
  const maxDimension = Math.max(width, height, depth);
  return Math.floor(Math.log2(maxDimension)) + 1;
};

const geometricSum = (n: number, r: number) => {
  return (1 - Math.pow(r, n)) / (1 - r);
};

const NODES_PER_OCTANT = 8;

/**
 * Creates an octree buffer for the given volume texture.
 * @param device - WebGPU device
 * @param volumeTexture - Volume texture to create octree buffer for
 * @returns {GPUBuffer} - Buffer representing the octree
 */
export const createOctreeBuffer = async (
  device: GPUDevice,
  volumeTexture: GPUTexture,
): Promise<GPUBuffer> => {
  const bufferStride = 4; // TODO: use byte offset in shader to only use 1 byte per element
  const width = nextPowerOf2(volumeTexture.width);
  const height = nextPowerOf2(volumeTexture.height);
  const depth = nextPowerOf2(volumeTexture.depthOrArrayLayers);
  const octreeLevels = calculateNumMipLevels([width, height, depth]);
  const bufferSize =
    geometricSum(octreeLevels, NODES_PER_OCTANT) * bufferStride;

  const octreeBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
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
    ],
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: volumeTexture.createView(),
      },
      {
        binding: 1,
        resource: {
          buffer: octreeBuffer,
        },
      },
    ],
  });

  const octreePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: generateMips,
      }),
      entryPoint: "main",
    },
  });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(octreePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(width, height, depth);
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  return octreeBuffer;
};
