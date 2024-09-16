import { NoiseCache } from "../../procgen/noise-cache";
import fillOctreeCompute from "./fill-octree.compute.wgsl";

const STRIDE = 4;

export const getOctreeBitMaskBuffers = async (
  device: GPUDevice,
  noiseCache: NoiseCache,
  size: number,
) => {
  const requiredBuffers = Math.ceil(Math.log2(size));

  // Get noise field as buffer
  const noiseFieldBuffer = device.createBuffer({
    size: noiseCache.buffer.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  // Copy noise field to buffer
  device.queue.writeBuffer(noiseFieldBuffer, 0, noiseCache.buffer);

  // Create buffer for each depth level
  const buffers: GPUBuffer[] = [];
  for (let i = 0; i < requiredBuffers; i++) {
    const bufferSize = Math.pow(2, i);
    const buffer = device.createBuffer({
      size: bufferSize * bufferSize * bufferSize * STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    buffers.push(buffer);
  }

  // Fill the octree with the bitmask of the leaf nodes
  const fillPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: fillOctreeCompute,
      entryPoint: "fill",
    },
  });

  // Group the nodes into the parent nodes
  const groupPipelines: GPUComputePipeline[] = [];

  const fillBindGroup = device.createBindGroup({
    layout: fillPipeline.getBindGroupLayout(0),
    entries: [
      // Noise field buffer
      {
        binding: 0,
        resource: {
          buffer: noiseFieldBuffer,
        },
      },
      // Buffer for current level
      {
        binding: 1,
        resource: {
          buffer: buffers[0],
        },
      },
    ],
  });

  let groupBindGroups: GPUBindGroup[] = [];
  for (let i = 1; i < requiredBuffers; i++) {
    const volumeSize = size / Math.pow(2, i);
    console.assert(size === 128 && i === 1 && volumeSize === 64);
    groupPipelines.push(
      device.createComputePipeline({
        layout: "auto",
        compute: {
          module: fillOctreeCompute,
          entryPoint: "group",
          constants: {
            volumeSize,
          },
        },
      }),
    );
    groupBindGroups.push(
      device.createBindGroup({
        layout: fillPipeline.getBindGroupLayout(0),
        entries: [
          // Noise field buffer
          {
            binding: 0,
            resource: {
              buffer: noiseFieldBuffer,
            },
          },
          // Buffer for current level
          {
            binding: 1,
            resource: {
              buffer: buffers[i],
            },
          },
          // Buffer for previous level
          {
            binding: 2,
            resource: {
              buffer: buffers[i - 1],
            },
          },
        ],
      }),
    );
  }

  // Fill mip level 0 with the bitmask of the leaf nodes using the noise field
  const commandEncoder = device.createCommandEncoder();
  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(fillPipeline);
  computePass.setBindGroup(0, fillBindGroup);
  computePass.dispatchWorkgroups(size / 4, size / 4, size / 4);

  // Group the nodes into the parent nodes
  groupPipelines.forEach((pipeline, i) => {
    const groupPass = commandEncoder.beginComputePass();
    groupPass.setPipeline(pipeline);
    groupPass.setBindGroup(0, groupBindGroups.shift());
    const volumeSize = size / Math.pow(2, i);
    groupPass.dispatchWorkgroups(
      volumeSize / 4,
      volumeSize / 4,
      volumeSize / 4,
    );
  });

  computePass.end();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
};
