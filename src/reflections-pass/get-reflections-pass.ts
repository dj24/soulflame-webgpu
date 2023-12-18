import reflections from "./reflections.wgsl";
import randomCommon from "../random-common.wgsl";
import { device, resolution } from "../app";
import { RenderArgs, RenderPass } from "../g-buffer/get-g-buffer-pass";

const downscaleFactor = 2;

export const getReflectionsPass = async (): Promise<RenderPass> => {
  let reflectionTexture: GPUTexture;

  const getDownscaledResolution = () => [
    Math.ceil(resolution[0] / downscaleFactor),
    Math.ceil(resolution[1] / downscaleFactor),
  ];

  console.log(resolution);

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
    outputTextureViews,
    frustumCornerDirectionsBuffer,
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
          resource: outputTextureViews.skyTextureView,
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
          binding: 5,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
        {
          binding: 6,
          resource: pointSampler,
        },
      ],
    });

    const getReflectionGBuffer = device.createBindGroup({
      layout: getReflectionPipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: outputTextureViews.normalTextureView,
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
          binding: 5,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
        {
          binding: 6,
          resource: pointSampler,
        },
      ],
    });

    const applyReflectionGBuffer = device.createBindGroup({
      layout: applyReflectionPipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 2,
          resource: outputTextureViews.finalTexture,
        },
        {
          binding: 1,
          resource: outputTextureViews.albedoTextureView,
        },
        {
          binding: 0,
          resource: outputTextureViews.normalTextureView,
        },
      ],
    });

    computePass.setPipeline(applyReflectionPipeline);
    computePass.setBindGroup(0, applyReflectionBindGroup);
    computePass.setBindGroup(1, applyReflectionGBuffer);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    computePass.end();
  };

  return { render };
};
