import diffuse from "./diffuse.wgsl";
import diffuseBlur from "./blur-diffuse.wgsl";
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
import { createTextureFromImage } from "webgpu-utils";

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
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
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
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba8unorm",
        },
      },
      {
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 8,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
        },
      },
    ],
  });

  const blurBindGroupLayout = device.createBindGroupLayout({
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
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "filtering",
        },
      },
    ],
  });

  const diffusePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout, gBufferBindGroupLayout],
    }),
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
    layout: device.createPipelineLayout({
      bindGroupLayouts: [blurBindGroupLayout, gBufferBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: diffuseBlur,
      }),
      entryPoint: "main",
    },
  });

  let diffuseTexture: GPUTexture;
  const blueNoiseTexture = await createTextureFromImage(
    device,
    "blue-noise-rg.png",
    {
      usage: GPUTextureUsage.COPY_SRC,
    },
  );

  const createDiffuseTextureView = () => {
    if (diffuseTexture) {
      return diffuseTexture.createView();
    }
    diffuseTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return diffuseTexture.createView();
  };

  const render = ({
    commandEncoder,
    outputTextures,
    frustumCornerDirectionsBuffer,
    voxelTextureView,
    resolutionBuffer,
    cameraPositionBuffer,
    transformationMatrixBuffer,
    timeBuffer,
  }: RenderArgs) => {
    const computePass = commandEncoder.beginComputePass();

    const gBuffer = device.createBindGroup({
      layout: gBufferBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: outputTextures.normalTexture.createView(),
        },
        {
          binding: 1,
          resource: outputTextures.albedoTexture.createView(),
        },
        {
          binding: 2,
          resource: outputTextures.finalTexture.createView(),
        },
        {
          binding: 3,
          resource: outputTextures.depthAndClusterTexture.createView(),
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
        {
          binding: 6,
          resource: createDiffuseTextureView(),
        },
        {
          binding: 7,
          resource: {
            buffer: timeBuffer,
          },
        },
        {
          binding: 8,
          resource: blueNoiseTexture.createView(),
        },
      ],
    });

    computePass.setPipeline(diffusePipeline);
    computePass.setBindGroup(0, uniforms);
    computePass.setBindGroup(1, gBuffer);
    computePass.dispatchWorkgroups(resolution[0] / 16, resolution[1] / 16);

    const blurUniforms = device.createBindGroup({
      layout: diffuseBlurPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 1,
          resource: createDiffuseTextureView(),
        },
        {
          binding: 2,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
      ],
    });

    // TODO: create temp texture for blurring like reflections
    computePass.setPipeline(diffuseBlurPipeline);
    computePass.setBindGroup(0, blurUniforms);
    computePass.setBindGroup(1, gBuffer);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    computePass.end();
  };

  return { render };
};
