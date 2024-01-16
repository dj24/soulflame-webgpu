import reflections from "./reflections.wgsl";
import randomCommon from "../random-common.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import { device, RenderArgs, RenderPass, resolution } from "../app";
import { createFloatUniformBuffer } from "../buffer-utils";

const downscaleFactor = 1;

export const getReflectionsPass = async (): Promise<RenderPass> => {
  let reflectionTexture: GPUTexture;

  const getDownscaledResolution = () => [
    Math.ceil(resolution[0] / downscaleFactor),
    Math.ceil(resolution[1] / downscaleFactor),
  ];

  const createReflectionTextureView = () => {
    if (reflectionTexture) {
      return reflectionTexture.createView();
    }
    const downscaledResolution = getDownscaledResolution();
    reflectionTexture = device.createTexture({
      size: [downscaledResolution[0], downscaledResolution[1], 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return reflectionTexture.createView();
  };

  const code = `
        ${randomCommon}
        ${getRayDirection}
        ${reflections}
        `;

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba8unorm",
          viewDimension: "2d",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "cube",
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
        texture: {
          sampleType: "float",
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
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

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
          viewDimension: "2d",
        },
      },
    ],
  });

  const getReflectionPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, gBufferBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "getReflections",
    },
  });

  const applyReflectionPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, gBufferBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "applyReflections",
    },
  });

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextures,
    viewProjectionMatricesBuffer,
  }: RenderArgs) => {
    const reflectionTextureView = createReflectionTextureView();
    const computePass = commandEncoder.beginComputePass();

    const pointSampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
    });

    const downscaleFactorBuffer = createFloatUniformBuffer(device, [
      downscaleFactor,
    ]);

    const skyTextureViewDescriptor: GPUTextureViewDescriptor = {
      dimension: "cube",
    };

    // Get reflections at half resolution
    const getReflectionsBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: reflectionTextureView,
        },
        {
          binding: 1,
          resource: outputTextures.skyTexture.createView(
            skyTextureViewDescriptor,
          ),
        },
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 3,
          resource: reflectionTexture.createView(),
        },
        {
          binding: 4,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 5,
          resource: pointSampler,
        },
        {
          binding: 6,
          resource: {
            buffer: downscaleFactorBuffer,
          },
        },
      ],
    });

    const gBufferBindGroup = device.createBindGroup({
      layout: gBufferBindGroupLayout,
      entries: [
        {
          binding: 2,
          resource: outputTextures.finalTexture.createView(),
        },
        {
          binding: 1,
          resource: outputTextures.albedoTexture.createView(),
        },
        {
          binding: 0,
          resource: outputTextures.normalTexture.createView(),
        },
      ],
    });

    computePass.setPipeline(getReflectionPipeline);
    computePass.setBindGroup(0, getReflectionsBindGroup);
    computePass.setBindGroup(1, gBufferBindGroup);
    const downscaledResolution = getDownscaledResolution();
    computePass.dispatchWorkgroups(
      downscaledResolution[0] / 8,
      downscaledResolution[1] / 8,
    );

    computePass.setPipeline(applyReflectionPipeline);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    computePass.end();
    return commandEncoder.finish();
  };

  return { render };
};
