import taa from "./taa.compute.wgsl";
import { device, RenderArgs, RenderPass, resolution } from "../app";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

const downscaleFactor = 1;

export const getTaaPass = async (): Promise<RenderPass> => {
  let historyTexture: GPUTexture;
  let currentFrameTexture: GPUTexture;
  let currentFrameTextureView: GPUTextureView;

  const taaPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: taa,
      }),
      entryPoint: "main",
    },
  });

  let historyTextureView: GPUTextureView;

  const render = ({
    commandEncoder,
    timestampWrites,
    outputTextures,
  }: RenderArgs) => {
    if (!historyTexture) {
      historyTexture = device.createTexture({
        label: "TAA History Texture",
        size: [resolution[0], resolution[1], 1],
        format: OUTPUT_TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST,
      });
      historyTextureView = historyTexture.createView();
    }
    if (!currentFrameTexture) {
      currentFrameTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: OUTPUT_TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST,
      });
      currentFrameTextureView = currentFrameTexture.createView();
    }

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture.texture, // TODO: pass texture as well as view
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
          resource: currentFrameTextureView,
        },
        {
          binding: 1,
          resource: outputTextures.velocityTexture.view,
        },
        {
          binding: 2,
          resource: outputTextures.finalTexture.view,
        },
        {
          binding: 3,
          resource: historyTextureView,
        },
        {
          binding: 5,
          resource: outputTextures.depthTexture.view,
        },
        // {
        //   binding: 6,
        //   resource: device.createSampler({
        //     magFilter: "nearest",
        //     minFilter: "nearest",
        //     mipmapFilter: "nearest",
        //   }),
        // },
      ],
    });

    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);
    computePass.end();

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture.texture,
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
