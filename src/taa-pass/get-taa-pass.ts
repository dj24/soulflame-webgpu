import taa from "./taa.wgsl";
import { device, RenderArgs, RenderPass, resolution } from "../app";

const downscaleFactor = 1;

export const getTaaPass = async (): Promise<RenderPass> => {
  let historyTexture: GPUTexture;

  const createHistoryTextureView = () => {
    if (historyTexture) {
      return historyTexture.createView();
    }
    historyTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return historyTexture.createView();
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
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(taaPipeline);

    const bindGroup = device.createBindGroup({
      layout: taaPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: outputTextureViews.finalTexture,
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
          resource: createHistoryTextureView(),
        },
        {
          binding: 4,
          resource: {
            buffer: resolutionBuffer,
          },
        },
      ],
    });
    // TODO: add seperate pass to write to history texture, cant read and write in same pass
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);
    computePass.end();
  };

  return { render };
};
