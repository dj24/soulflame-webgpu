import diffuse from "./diffuse.wgsl";
import randomCommon from "../random-common.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import {
  debugValues,
  device,
  RenderArgs,
  RenderPass,
  resolution,
} from "../app";

// TODO: move resolution and time into constants instead of buffer
export const getDiffusePass = async (): Promise<RenderPass> => {
  const gBufferBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba8unorm",
        },
      },
    ],
  });

  const uniformsBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 1,
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
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "non-filtering",
        },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformsBindGroupLayout, gBufferBindGroupLayout],
  });

  const diffusePipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${randomCommon}
          ${boxIntersection}
          ${getRayDirection}
          ${raymarchVoxels}
          ${diffuse}
      `,
      }),
      entryPoint: "main",
    },
  });

  const diffuseBlurPipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${randomCommon}
          ${boxIntersection}
          ${getRayDirection}
          ${raymarchVoxels}
          ${diffuse}
      `,
      }),
      entryPoint: "blur",
    },
  });

  const render = ({
    commandEncoder,
    outputTextureViews,
    frustumCornerDirectionsBuffer,
    voxelTextureView,
    resolutionBuffer,
    cameraPositionBuffer,
    transformationMatrixBuffer,
  }: RenderArgs) => {
    const computePass = commandEncoder.beginComputePass();

    const gBuffer = device.createBindGroup({
      layout: gBufferBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: outputTextureViews.normalTextureView,
        },
        {
          binding: 1,
          resource: outputTextureViews.albedoTextureView,
        },
        {
          binding: 2,
          resource: outputTextureViews.finalTexture,
        },
      ],
    });

    const uniforms = device.createBindGroup({
      layout: diffusePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 1,
          resource: voxelTextureView,
        },
        {
          binding: 2,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
        {
          binding: 5,
          resource: device.createSampler({
            magFilter: "nearest",
            minFilter: "nearest",
          }),
        },
      ],
    });

    computePass.setPipeline(diffusePipeline);
    computePass.setBindGroup(0, uniforms);
    computePass.setBindGroup(1, gBuffer);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    // TODO: create temp texture for blurring like reflections
    // computePass.setPipeline(diffuseBlurPipeline);
    // computePass.setBindGroup(0, uniforms);
    // computePass.setBindGroup(1, gBuffer);
    // computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    computePass.end();
  };

  return { render };
};
