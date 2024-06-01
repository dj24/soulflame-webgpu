import { SKYBOX_TEXTURE_FORMAT } from "../constants";

export const createSkyTexture = (device: GPUDevice) => {
  return device.createTexture({
    label: "sky texture",
    dimension: "2d",
    size: [640, 640, 6],
    format: SKYBOX_TEXTURE_FORMAT,
    usage:
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING,
  });
};
