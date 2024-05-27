import { GBufferTexture, gBufferTextureFactory } from "./g-buffer-texture";
import { device } from "../app";

export const createCopyOfGBufferTexture = (
  device: GPUDevice,
  source: GBufferTexture,
): GBufferTexture => {
  let Factory = gBufferTextureFactory(
    `${source.label}-copy`,
    source.format,
    source.usage,
  );
  return new Factory(device, source.width, source.height);
};

export const copyGBufferTexture = (
  commandEncoder: GPUCommandEncoder,
  source: GBufferTexture,
  destination: GBufferTexture,
): void => {
  if (
    source.width !== destination.width ||
    source.height !== destination.height
  ) {
    throw new Error(
      "Source and destination textures must have the same dimensions",
    );
  }
  commandEncoder.copyTextureToTexture(
    {
      texture: source.texture,
    },
    {
      texture: destination.texture,
    },
    {
      width: source.texture.width,
      height: source.texture.height,
      depthOrArrayLayers: 1,
    },
  );
};
