import taa from "./taa.compute.wgsl";
import { device, RenderArgs, RenderPass, resolution } from "../app";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";
import { GBufferTexture } from "@renderer/abstractions/g-buffer-texture";

export const getTaaPass = async (
  gBufferTexture: GBufferTexture,
): Promise<RenderPass> => {
  let historyTexture: GPUTexture;
  let currentFrameTexture: GPUTexture;
  let currentFrameTextureView: GPUTextureView;
  let historyTextureView: GPUTextureView;
  let copyWorldPosTexture: GPUTexture;
  let copyWorldPosTextureView: GPUTextureView;

  const taaPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(2) var HistoryWrite : texture_storage_2d<${gBufferTexture.format}, write>;
        ${taa}`,
      }),
      entryPoint: "main",
    },
  });

  const render = ({
    commandEncoder,
    timestampWrites,
    outputTextures,
  }: RenderArgs) => {
    if (!historyTexture) {
      historyTexture = device.createTexture({
        label: "TAA History Texture",
        size: [resolution[0], resolution[1], 1],
        format: gBufferTexture.format,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST,
      });
      historyTextureView = historyTexture.createView();
    }
    if (!copyWorldPosTexture) {
      copyWorldPosTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: outputTextures.worldPositionTexture.format,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.TEXTURE_BINDING,
      });
      copyWorldPosTextureView = copyWorldPosTexture.createView();
    }
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.worldPositionTexture.texture,
      },
      {
        texture: copyWorldPosTexture,
      },
      {
        width: copyWorldPosTexture.width,
        height: copyWorldPosTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );

    if (!currentFrameTexture) {
      currentFrameTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: gBufferTexture.format,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST,
      });
      currentFrameTextureView = currentFrameTexture.createView();
    }

    commandEncoder.copyTextureToTexture(
      {
        texture: gBufferTexture.texture, // TODO: pass texture as well as view
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
          resource: gBufferTexture.view,
        },
        {
          binding: 3,
          resource: historyTextureView,
        },
        {
          binding: 4,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
          }),
        },
        {
          binding: 5,
          resource: device.createSampler({
            magFilter: "nearest",
            minFilter: "nearest",
            mipmapFilter: "nearest",
          }),
        },
        {
          binding: 6,
          resource: copyWorldPosTextureView,
        },
      ],
    });

    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);
    computePass.end();

    commandEncoder.copyTextureToTexture(
      {
        texture: gBufferTexture.texture,
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
  };

  return { render, label: `taa-${gBufferTexture.label}` };
};
