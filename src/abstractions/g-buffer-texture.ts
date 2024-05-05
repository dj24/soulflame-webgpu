import { Singleton } from "../decorators/singleton";

export class GBufferTexture extends Singleton {
  texture: GPUTexture;
  view: GPUTextureView;

  constructor(texture: GPUTexture, view: GPUTextureView) {
    super();
    this.texture = texture;
    this.view = view;
  }

  destroy() {
    this.texture.destroy();
  }
}
