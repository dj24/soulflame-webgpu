import {
  debugValues,
  device,
  RenderArgs,
  RenderPass,
  resolution,
} from "../app";
import shadows from "./shadows.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import randomCommon from "../random-common.wgsl";

export const getShadowsPass = async (): Promise<RenderPass> => {
  const voxelsEntry: GPUBindGroupLayoutEntry = {
    binding: 0,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
      viewDimension: "3d",
    },
  };
  const depthEntry: GPUBindGroupLayoutEntry = {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "unfilterable-float",
    },
  };
  const normalEntry: GPUBindGroupLayoutEntry = {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  };
  const outputTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8unorm",
      viewDimension: "2d",
    },
  };

  const cameraPositionEntry: GPUBindGroupLayoutEntry = {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  };

  const viewProjectionMatricesEntry: GPUBindGroupLayoutEntry = {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  };

  const voxelObjectsEntry: GPUBindGroupLayoutEntry = {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  };

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      voxelsEntry,
      depthEntry,
      normalEntry,
      outputTextureEntry,
      cameraPositionEntry,
      viewProjectionMatricesEntry,
      voxelObjectsEntry,
    ],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${randomCommon}
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}${shadows}`,
      }),
      entryPoint: "main",
    },
  });
  const render = ({
    outputTextures,
    cameraPositionBuffer,
    viewProjectionMatricesBuffer,
    timestampWrites,
    voxelTextureView,
    transformationMatrixBuffer,
  }: RenderArgs) => {
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: voxelTextureView,
        },
        {
          binding: 1,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 2,
          resource: outputTextures.normalTexture.createView(),
        },
        {
          binding: 3,
          resource: outputTextures.finalTexture.createView(),
        },
        {
          binding: 4,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 5,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 6,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass({
      timestampWrites,
    });
    pass.setPipeline(computePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );
    pass.end();
    return [commandEncoder.finish()];
  };

  return { render, label: "shadows" };
};
