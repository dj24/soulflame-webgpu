import gBufferRaymarch from "./g-buffer-raymarch.wgsl";
import gBufferRaster from "./g-buffer-raster.wgsl";
import clearPixelBuffer from "./clear-pixel-buffer.wgsl";
import pixelBufferElement from "./pixel-buffer-element.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import bvh from "../shader/bvh.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import treeHouse from "../voxel-models/tavern.vxm";

import {
  camera,
  device,
  debugValues,
  resolution,
  RenderPass,
  RenderArgs,
} from "../app";
import cornellBox from "../voxel-models/cornell.vxm";

export type OutputTextures = {
  finalTexture: GPUTexture;
  albedoTexture?: GPUTexture;
  normalTexture?: GPUTexture;
  velocityTexture?: GPUTexture;
  depthAndClusterTexture?: GPUTexture;
  debugTexture?: GPUTexture;
  skyTexture?: GPUTexture;
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

export const getGBufferPass = async (): Promise<RenderPass> => {
  const normalEntry: GPUBindGroupLayoutEntry = {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8snorm",
      viewDimension: "2d",
    },
  };

  const albedoEntry: GPUBindGroupLayoutEntry = {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8unorm",
      viewDimension: "2d",
    },
  };

  const velocityEntry: GPUBindGroupLayoutEntry = {
    binding: 7,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba32float",
      viewDimension: "2d",
    },
  };
  const depthAndClusterEntry: GPUBindGroupLayoutEntry = {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba32float",
      viewDimension: "2d",
    },
  };

  const sunDirectionEntry: GPUBindGroupLayoutEntry = {
    binding: 9,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  };

  const bvhBufferEntry: GPUBindGroupLayoutEntry = {
    binding: 10,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  };

  const matricesBufferEntry: GPUBindGroupLayoutEntry = {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  };

  const kernelGroupsToFullyTraceEntry: GPUBindGroupLayoutEntry = {
    binding: 11,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "storage",
    },
  };

  const indirectArgsEntry: GPUBindGroupLayoutEntry = {
    binding: 12,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "storage",
    },
  };

  const uniformsBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "3d",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      matricesBufferEntry,
      normalEntry,
      albedoEntry,
      depthAndClusterEntry,
      velocityEntry,
      {
        binding: 8,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      sunDirectionEntry,
      bvhBufferEntry,
      kernelGroupsToFullyTraceEntry,
      indirectArgsEntry,
    ],
  });

  const adaptiveTracePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          struct IndirectArgs {
            count: atomic<u32>
          };
          @group(0) @binding(10) var<storage> bvhNodes: array<BVHNode>;
          @group(0) @binding(11) var<storage, read_write> groupsToFullyTrace: array<vec2<u32>>;
          @group(0) @binding(12) var<storage, read_write> indirectArgs: IndirectArgs;
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${bvh}
          ${gBufferRaymarch}`,
      }),
      entryPoint: "main",
    },
  });

  const fullTracePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          struct IndirectArgs {
            count: atomic<u32>
          };
          @group(0) @binding(10) var<storage> bvhNodes: array<BVHNode>;
          @group(0) @binding(11) var<storage, read_write> groupsToFullyTrace: array<vec2<u32>>;
          @group(0) @binding(12) var<storage, read_write> indirectArgs: IndirectArgs;
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${bvh}
          ${gBufferRaymarch}`,
      }),
      entryPoint: "fullTrace",
    },
  });

  let kernelGroupsToFullyTraceBuffer: GPUBuffer;
  let indirectBuffer: GPUBuffer;
  let indirectBufferCopy: GPUBuffer;

  const render = ({
    commandEncoder,
    outputTextures,
    cameraPositionBuffer,
    voxelTextureView,
    transformationMatrixBuffer,
    viewProjectionMatricesBuffer,
    timestampWrites,
    sunDirectionBuffer,
    bvhBuffer,
  }: RenderArgs) => {
    // TODO: combine into one buffer, store indirect args at the front
    if (!indirectBuffer) {
      indirectBuffer = device.createBuffer({
        size: 4 * 4,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });
    }
    if (!indirectBufferCopy) {
      indirectBufferCopy = device.createBuffer({
        size: 4 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.INDIRECT,
      });
    }
    if (!kernelGroupsToFullyTraceBuffer) {
      // 9 is kernel size
      const maxGroupsToFullyTrace = (resolution[0] * resolution[1]) / 9;
      kernelGroupsToFullyTraceBuffer = device.createBuffer({
        size: ceilToNearestMultipleOf(4 * maxGroupsToFullyTrace, 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    } else {
      commandEncoder.clearBuffer(kernelGroupsToFullyTraceBuffer);
    }

    device.queue.writeBuffer(indirectBuffer, 0, new Uint32Array([128, 1, 1]));

    let computePass = commandEncoder.beginComputePass();

    const computeBindGroup = device.createBindGroup({
      layout: uniformsBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: voxelTextureView,
        },
        {
          binding: 2,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
        {
          binding: 4,
          resource: outputTextures.normalTexture.createView(),
        },
        {
          binding: 5,
          resource: outputTextures.albedoTexture.createView(),
        },
        {
          binding: 6,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 7,
          resource: outputTextures.velocityTexture.createView(),
        },
        {
          binding: 8,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 9,
          resource: {
            buffer: sunDirectionBuffer,
          },
        },
        {
          binding: 10,
          resource: {
            buffer: bvhBuffer,
          },
        },
        {
          binding: 11,
          resource: {
            buffer: kernelGroupsToFullyTraceBuffer,
          },
        },
        {
          binding: 12,
          resource: {
            buffer: indirectBuffer,
          },
        },
      ],
    });

    // Raymarch the scene
    const threadGroupCountX = 8;
    const threadGroupCountY = 8;
    const spatialKernelSize = 9;
    const workGroupsX = Math.ceil(
      resolution[0] / threadGroupCountX / spatialKernelSize,
    );
    const workGroupsY = Math.ceil(
      resolution[1] / threadGroupCountY / spatialKernelSize,
    );
    computePass.setPipeline(adaptiveTracePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(workGroupsX, workGroupsY);
    computePass.end();

    // Copy first 4 bytes - the count of groups to fully trace aka length of the buffer
    commandEncoder.copyBufferToBuffer(
      indirectBuffer,
      0,
      indirectBufferCopy,
      0,
      12,
    );

    // TODO: find way of recording sub pass timings
    // Fully raymarch high variance sections
    computePass = commandEncoder.beginComputePass({ timestampWrites });
    computePass.setPipeline(fullTracePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    // Dispatch one per group to fully trace
    computePass.dispatchWorkgroupsIndirect(indirectBufferCopy, 0);
    computePass.end();

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.albedoTexture, // TODO: pass texture as well as view
      },
      {
        texture: outputTextures.finalTexture,
      },
      {
        width: outputTextures.finalTexture.width,
        height: outputTextures.finalTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );

    return [commandEncoder.finish()];
  };

  return { render, label: "g-buffer" };
};
