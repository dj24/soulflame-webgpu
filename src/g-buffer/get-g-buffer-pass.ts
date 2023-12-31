import gBuffer from "./g-buffer.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import teapot from "../voxel-models/teapot.vxm";

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
      format: "r32float",
      viewDimension: "2d",
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
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      normalEntry,
      albedoEntry,
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
        },
      },
      velocityEntry,
      {
        binding: 8,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${gBuffer}`,
      }),
      entryPoint: "projectVoxels",
    },
  });

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextures,
    cameraPositionBuffer,
    frustumCornerDirectionsBuffer,
    voxelTextureView,
    transformationMatrixBuffer,
    viewProjectionMatricesBuffer,
  }: RenderArgs) => {
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);

    const computeBindGroup = device.createBindGroup({
      layout: uniformsBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: voxelTextureView,
        },
        {
          binding: 1,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
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
      ],
    });

    // const workGroupsX = Math.ceil(resolution[0] / 8);
    // const workGroupsY = Math.ceil(resolution[1] / 8);

    const workGroupsX = Math.ceil(teapot.size[0]);
    const workGroupsY = Math.ceil(teapot.size[1]);
    const workGroupsZ = Math.ceil(teapot.size[2]);

    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(workGroupsX, workGroupsY, workGroupsZ);
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
    return commandEncoder.finish();
  };

  return { render, label: "G-Buffer" };
};
