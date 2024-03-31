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
      {
        binding: 9,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
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

  const diffuseCode = `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${randomCommon}
          ${boxIntersection}
          ${getRayDirection}
          ${raymarchVoxels}
          ${diffuse}
      `;

  const diffusePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout, gBufferBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: diffuseCode,
      }),
      entryPoint: "main",
    },
  });

  const radianceCachePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout, gBufferBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: diffuseCode,
      }),
      entryPoint: "getRadianceCache",
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

  const blueNoiseTexture = await createTextureFromImage(
    device,
    "blue-noise-rg.png",
    {
      usage: GPUTextureUsage.COPY_SRC,
    },
  );

  let diffuseTexture: GPUTexture;

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

  const numThreadsX = 8;
  const numThreadsY = 8;

  const radianceCacheDownscale = 32;

  let screenSpaceRadianceCacheBuffer: GPUBuffer;

  const bytesBerCacheEntry = 16 * 3; // 16 bytes (4 per component, 4 padding) for colour, normal and worldPosition

  const getScreenSpaceRadianceCacheBuffer = (width: number, height: number) => {
    const totalSize = width * height * bytesBerCacheEntry;
    if (
      screenSpaceRadianceCacheBuffer &&
      screenSpaceRadianceCacheBuffer.size == totalSize
    ) {
      return screenSpaceRadianceCacheBuffer;
    }
    screenSpaceRadianceCacheBuffer = device.createBuffer({
      size: totalSize,
      usage: GPUBufferUsage.STORAGE,
    });
    return screenSpaceRadianceCacheBuffer;
  };

  const render = ({
    commandEncoder,
    outputTextures,
    volumeAtlas,
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
          resource: outputTextures.depthTexture.createView(),
        },
      ],
    });

    const radianceCacheSize = [
      Math.ceil(resolution[0] / radianceCacheDownscale),
      Math.ceil(resolution[1] / radianceCacheDownscale),
    ];

    const radianceCacheBuffer = getScreenSpaceRadianceCacheBuffer(
      radianceCacheSize[0],
      radianceCacheSize[1],
    );

    const uniforms = device.createBindGroup({
      layout: diffusePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 1,
          resource: volumeAtlas.getAtlasTextureView(),
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
        {
          binding: 9,
          resource: {
            buffer: radianceCacheBuffer,
          },
        },
      ],
    });

    computePass.setBindGroup(0, uniforms);
    computePass.setBindGroup(1, gBuffer);

    computePass.setPipeline(radianceCachePipeline);
    computePass.dispatchWorkgroups(
      Math.ceil(radianceCacheSize[0] / numThreadsX),
      Math.ceil(radianceCacheSize[1] / numThreadsY),
    );

    const halfResolution = [resolution[0] / 2, resolution[1] / 2];
    computePass.setPipeline(diffusePipeline);
    computePass.dispatchWorkgroups(
      halfResolution[0] / numThreadsX,
      halfResolution[1] / numThreadsY,
    );

    // Denoise (basic clamped blur for now)
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

    computePass.setPipeline(diffuseBlurPipeline);
    computePass.setBindGroup(0, blurUniforms);
    computePass.setBindGroup(1, gBuffer);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    computePass.end();
    return [commandEncoder.finish()];
  };

  return { render, label: "diffuse" };
};
