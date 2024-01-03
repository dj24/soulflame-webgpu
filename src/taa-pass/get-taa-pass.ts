import taa from "./taa.wgsl";
import { device, RenderArgs, RenderPass, resolution } from "../app";

const downscaleFactor = 1;

export const getTaaPass = async (): Promise<RenderPass> => {
  let historyTexture: GPUTexture;
  let currentFrameTexture: GPUTexture;

  const createHistoryTextureView = () => {
    if (historyTexture) {
      return historyTexture.createView();
    }
    historyTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
    return historyTexture.createView();
  };

  // Need to make output texture as we cant read and write to same texture in same pass
  const createCurrentFrameTextureView = () => {
    if (currentFrameTexture) {
      return currentFrameTexture.createView();
    }
    currentFrameTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
    return currentFrameTexture.createView();
  };

  const taaPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: taa,
      }),
      entryPoint: "main",
    },
  });
  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextureViews,
    frustumCornerDirectionsBuffer,
  }: RenderArgs) => {
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextureViews.finalTexture, // TODO: pass texture as well as view
      },
      {
        texture: currentFrameTexture,
      },
      {
        width: currentFrameTexture.width,
        height: currentFrameTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(taaPipeline);

    const bindGroup = device.createBindGroup({
      layout: taaPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: createCurrentFrameTextureView(),
        },
        {
          binding: 1,
          resource: outputTextureViews.velocityTextureView,
        },
        {
          binding: 2,
          resource: createHistoryTextureView(),
        },
        {
          binding: 3,
          resource: outputTextureViews.finalTexture,
        },
        {
          binding: 4,
          resource: {
            buffer: resolutionBuffer,
          },
        },
      ],
    });

    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);
    computePass.end();
  };

  return { render };
};
