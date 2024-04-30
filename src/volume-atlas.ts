import { Vec3 } from "wgpu-matrix";
import { VOLUME_ATLAS_FORMAT, VOLUME_MIP_LEVELS } from "./constants";
import { writeTextureToCanvas } from "./write-texture-to-canvas";

const descriptorPartial: Omit<GPUTextureDescriptor, "size"> = {
  format: VOLUME_ATLAS_FORMAT,
  usage:
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.TEXTURE_BINDING,
  dimension: "3d",
};

type VolumeAtlasEntry = {
  /** The location of the volume in the atlas texture */
  location: Vec3;
  /** The size of the volume in the atlas texture */
  size: Vec3;
  /** The y position of the volume in the atlas texture */
  paletteIndex: number;
};

export type VolumeAtlasDictionary = {
  [key: string]: VolumeAtlasEntry;
};

const DEFAULT_ATLAS_SIZE = 8;
const PALETTE_WIDTH = 256;
const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

/** A class representing a volume atlas for storing multiple 3D textures.
 *
 * Each texture is packed along the x-axis of the atlas texture.
 * //TODO: Add support for packing along other axes
 *
 * @example
 * const device = navigator.gpu.requestAdapter();
 * const volumeAtlas = new VolumeAtlas(device);
 * const volume = await createTextureFromVoxels(device, voxels, "cube");
 * volumeAtlas.addVolume(volume, "cube");
 */

export class VolumeAtlas {
  #dictionary: VolumeAtlasDictionary = {};
  #atlasTexture: GPUTexture;
  #paletteTexture: GPUTexture;
  #device: GPUDevice;

  constructor(device: GPUDevice) {
    this.#device = device;
    this.#atlasTexture = device.createTexture({
      size: {
        width: DEFAULT_ATLAS_SIZE,
        height: DEFAULT_ATLAS_SIZE,
        depthOrArrayLayers: DEFAULT_ATLAS_SIZE,
      },
      ...descriptorPartial,
      label: `Volume atlas containing `,
      mipLevelCount: VOLUME_MIP_LEVELS,
    });
    this.#paletteTexture = device.createTexture({
      size: {
        width: PALETTE_WIDTH,
        height: 1,
        depthOrArrayLayers: 1,
      },
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING,
      label: "Palette texture",
      mipLevelCount: 1,
    });
  }

  get dictionary() {
    return this.#dictionary;
  }

  addVolume = async (
    volume: GPUTexture,
    palette: GPUTexture,
    label: string,
  ) => {
    if (this.#dictionary[label]) {
      throw new Error(
        `Error adding volume to atlas: volume with label ${label} already exists`,
      );
    }

    const commandEncoder = this.#device.createCommandEncoder();

    const { width, height, depthOrArrayLayers } = volume;
    const roundedWidth = ceilToNearestMultipleOf(width, 8);
    const roundedHeight = ceilToNearestMultipleOf(height, 8);
    const roundedDepth = ceilToNearestMultipleOf(depthOrArrayLayers, 8);

    const newWidth = this.#atlasTexture.width + roundedWidth;
    if (newWidth > this.#device.limits.maxTextureDimension3D) {
      throw new Error(
        `Error adding volume to atlas: adding volume would exceed device max texture dimension of ${this.#device.limits.maxTextureDimension3D}`,
      );
    }

    const newHeight = Math.max(this.#atlasTexture.height, roundedHeight);
    const newDepth = Math.max(
      this.#atlasTexture.depthOrArrayLayers,
      roundedDepth,
    );
    const newAtlasTexture = this.#device.createTexture({
      size: {
        width: newWidth,
        height: newHeight,
        depthOrArrayLayers: newDepth,
      },
      mipLevelCount: this.#atlasTexture.mipLevelCount,
      ...descriptorPartial,
      label: `${this.#atlasTexture.label}, ${volume.label || "unnamed volume"}`,
    });

    const atlasLocationX = this.#atlasTexture.width;

    // Copy the old atlas texture into the new larger one
    commandEncoder.copyTextureToTexture(
      {
        texture: this.#atlasTexture,
      },
      {
        texture: newAtlasTexture,
      },
      {
        width: this.#atlasTexture.width,
        height: this.#atlasTexture.height,
        depthOrArrayLayers: this.#atlasTexture.depthOrArrayLayers,
      },
    );

    for (
      let mipLevel = 0;
      mipLevel < Math.min(volume.mipLevelCount, newAtlasTexture.mipLevelCount);
      mipLevel++
    ) {
      const mipWidth = Math.max(1, volume.width >> mipLevel);
      const mipHeight = Math.max(1, volume.height >> mipLevel);
      const mipDepth = Math.max(1, volume.depthOrArrayLayers >> mipLevel);
      commandEncoder.copyTextureToTexture(
        {
          texture: volume,
          mipLevel,
          origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
        },
        {
          texture: newAtlasTexture,
          mipLevel,
          origin: { x: atlasLocationX >> mipLevel, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
        },
        {
          width: mipWidth,
          height: mipHeight,
          depthOrArrayLayers: mipDepth,
        },
      );
    }

    this.#atlasTexture = newAtlasTexture;

    const paletteIndex = this.#paletteTexture.height;

    this.#dictionary[label] = {
      location: [atlasLocationX, 0, 0],
      size: [width, height, depthOrArrayLayers],
      paletteIndex,
    };

    // Copy the old palette texture into the new larger one
    const newPaletteTexture = this.#device.createTexture({
      size: {
        width: PALETTE_WIDTH,
        height: this.#paletteTexture.height + 1,
        depthOrArrayLayers: 1,
      },
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING,
      label: "Palette texture",
      mipLevelCount: 1,
    });

    commandEncoder.copyTextureToTexture(
      {
        texture: this.#paletteTexture,
      },
      {
        texture: newPaletteTexture,
      },
      {
        width: PALETTE_WIDTH,
        height: this.#paletteTexture.height,
        depthOrArrayLayers: 1,
      },
    );

    // Add the new palette to the palette texture
    commandEncoder.copyTextureToTexture(
      {
        texture: palette,
      },
      {
        texture: newPaletteTexture,
        origin: { x: 0, y: paletteIndex, z: 0 },
      },
      {
        width: PALETTE_WIDTH,
        height: 1,
        depthOrArrayLayers: 1,
      },
    );

    this.#paletteTexture = newPaletteTexture;

    this.#device.queue.submit([commandEncoder.finish()]);
    await this.#device.queue.onSubmittedWorkDone();

    writeTextureToCanvas(this.#device, "debug-canvas", this.#paletteTexture);

    //TODO: adjust to use render pipeline to support 8 bit format
    // const zSliceTexture = await flipTexture(
    //   device,
    //   await flatten3dTexture(device, newAtlasTexture),
    // );
    // writeTextureToCanvas(device, "debug-canvas", zSliceTexture);
  };

  get atlasTextureView() {
    return this.#atlasTexture.createView({
      label: this.#atlasTexture.label,
    });
  }

  get paletteTextureView() {
    return this.#paletteTexture.createView({
      label: this.#paletteTexture.label,
    });
  }
}
