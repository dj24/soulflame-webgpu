import { Singleton } from "../decorators/singleton";

const gBufferTextureFactory = (format: GPUTextureFormat) => {
  @Singleton
  class GBufferTexture {
    readonly #texture: GPUTexture;
    readonly #view: GPUTextureView;
    constructor(device: GPUDevice, width: number, height: number) {
      this.#texture = device.createTexture({
        size: [width, height, 1],
        format,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC,
      });
      this.#view = this.#texture.createView();
    }
    get texture() {
      return this.#texture;
    }
    get view() {
      return this.#view;
    }
  }

  return GBufferTexture;
};

export const AlbedoTexture = gBufferTextureFactory("rgba8unorm");
