export const flatten3dTexture = async (
  device: GPUDevice,
  texture: GPUTexture,
): Promise<GPUTexture> => {
  const { width, height, depthOrArrayLayers } = texture;
  const textureFormat = texture.format;

  const stagingTexture = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format: textureFormat,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
  });

  // TODO: create compute shadoer to flatten 3d texture

  return stagingTexture;
};
