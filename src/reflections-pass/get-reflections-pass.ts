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

  const getReflectionPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "getReflections",
    },
  });

  const applyReflectionPipeline = device.createComputePipeline({
    layout: "auto",
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
  }: RenderArgs) => {
    const reflectionTextureView = createReflectionTextureView();
    const computePass = commandEncoder.beginComputePass();

    const linearSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    const pointSampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
    });

    const downscaleFactorBuffer = createFloatUniformBuffer(device, [
      downscaleFactor,
    ]);

    // Get reflections at half resolution
    const getReflectionsBindGroup = device.createBindGroup({
      layout: getReflectionPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: reflectionTextureView,
        },
        {
          binding: 1,
          resource: outputTextures.skyTexture.createView(),
        },
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        // {
        //   binding: 4,
        //   resource: linearSampler,
        // },
        {
          binding: 6,
          resource: pointSampler,
        },
        {
          binding: 7,
          resource: {
            buffer: downscaleFactorBuffer,
          },
        },
      ],
    });

    const getReflectionGBuffer = device.createBindGroup({
      layout: getReflectionPipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: outputTextures.normalTexture.createView(),
        },
      ],
    });

    computePass.setPipeline(getReflectionPipeline);
    computePass.setBindGroup(0, getReflectionsBindGroup);
    computePass.setBindGroup(1, getReflectionGBuffer);
    const downscaledResolution = getDownscaledResolution();
    computePass.dispatchWorkgroups(
      downscaledResolution[0] / 8,
      downscaledResolution[1] / 8,
    );

    // Apply reflections to output
    const applyReflectionBindGroup = device.createBindGroup({
      layout: applyReflectionPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 3,
          resource: reflectionTextureView,
        },
        {
          binding: 4,
          resource: linearSampler,
        },
        {
          binding: 6,
          resource: pointSampler,
        },
        {
          binding: 7,
          resource: {
            buffer: downscaleFactorBuffer,
          },
        },
      ],
    });

    const applyReflectionGBuffer = device.createBindGroup({
      layout: applyReflectionPipeline.getBindGroupLayout(1),
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

    computePass.setPipeline(applyReflectionPipeline);
    computePass.setBindGroup(0, applyReflectionBindGroup);
    computePass.setBindGroup(1, applyReflectionGBuffer);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    computePass.end();
    return commandEncoder.finish();
  };

  return { render };
};
