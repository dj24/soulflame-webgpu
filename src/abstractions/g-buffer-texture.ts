import { Singleton } from "../decorators/singleton";

export const defaultUsage =
  GPUTextureUsage.TEXTURE_BINDING |
  GPUTextureUsage.COPY_SRC |
  GPUTextureUsage.COPY_DST |
  GPUTextureUsage.STORAGE_BINDING |
  GPUTextureUsage.RENDER_ATTACHMENT;

const gBufferTextureFactory = (
  label: string,
  format: GPUTextureFormat,
  usage = defaultUsage,
) => {
  @Singleton
  class GBufferTexture {
    readonly #texture: GPUTexture;
    readonly #view: GPUTextureView;
    readonly #width: number;
    readonly #height: number;
    readonly #format = format;
    readonly #usage = usage;
    constructor(device: GPUDevice, width: number, height: number) {
      this.#texture = device.createTexture({
        label,
        size: [width, height, 1],
        format,
        usage,
      });
      this.#view = this.#texture.createView();
      this.#width = width;
      this.#height = height;
    }
    get texture() {
      return this.#texture;
    }
    get view() {
      return this.#view;
    }
    get width() {
      return this.#width;
    }
    get height() {
      return this.#height;
    }
    get format() {
      return this.#format;
    }
    get usage() {
      return this.#usage;
    }
  }

  return GBufferTexture;
};

export type GBufferTexture = InstanceType<
  ReturnType<typeof gBufferTextureFactory>
>;

export const AlbedoTexture = gBufferTextureFactory("albedo", "rgba8unorm");
export const NormalTexture = gBufferTextureFactory("normal", "rgba16float");
export const DepthTexture = gBufferTextureFactory(
  "depth",
  "depth32float",
  GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.RENDER_ATTACHMENT |
    GPUTextureUsage.COPY_SRC,
  // defaultUsage & ~GPUTextureUsage.STORAGE_BINDING,
);
export const VelocityTexture = gBufferTextureFactory("velocity", "rgba16float");
export const WorldPositionTexture = gBufferTextureFactory(
  "world position",
  "rgba32float",
);
export const OutputTexture = gBufferTextureFactory("output", "rgba8unorm");