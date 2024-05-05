import { Singleton } from "../decorators/singleton";

interface GBufferTexture {
  texture: GPUTexture;
  view: GPUTextureView;
}

@Singleton
export class AlbedoTexture implements GBufferTexture {
  #texture: GPUTexture;
  #view: GPUTextureView;

  constructor(device: GPUDevice, width: number, height: number) {
    console.debug("Creating albedo texture");
    this.#texture = device.createTexture({
      size: [width, height, 1],
      format: "rgba8unorm",
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
