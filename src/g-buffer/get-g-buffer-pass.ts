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
    ],
  });

  const pipeline = device.createComputePipeline({
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
    let computePass = commandEncoder.beginComputePass({ timestampWrites });

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
      ],
    });

    // Raymarch the scene
    const threadGroupCountX = 8;
    const threadGroupCountY = 8;
    const workGroupsX = Math.ceil(resolution[0] / threadGroupCountX);
    const workGroupsY = Math.ceil(resolution[1] / threadGroupCountY);
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(workGroupsX, workGroupsY);
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
