import taa from "./taa.wgsl";
import { device, RenderArgs, RenderPass, resolution } from "../app";

const downscaleFactor = 1;

export const getTaaPass = async (): Promise<RenderPass> => {
  let historyTexture: GPUTexture;
  let currentFrameTexture: GPUTexture;

  const createHistoryTextureView = () => {
    if (!historyTexture) {
      historyTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST,
      });
    }
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
    timestampWrites,
    outputTextures,
  }: RenderArgs) => {
    if (!currentFrameTexture) {
      currentFrameTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST,
      });
    }

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture, // TODO: pass texture as well as view
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

    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });
    computePass.setPipeline(taaPipeline);

    const bindGroup = device.createBindGroup({
      layout: taaPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: currentFrameTexture.createView(),
        },
        {
          binding: 1,
          resource: outputTextures.velocityTexture.createView(),
        },
        {
          binding: 2,
          resource: outputTextures.finalTexture.createView(),
        },
        {
          binding: 3,
          resource: createHistoryTextureView(),
        },
        {
          binding: 5,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
      ],
    });

    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);
    computePass.end();

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture,
      },
      {
        texture: historyTexture,
      },
      {
        width: historyTexture.width,
        height: historyTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );
    return [commandEncoder.finish()];
  };

  return { render, label: "taa" };
};
