import { vec3, Vec3 } from "wgpu-matrix";
import { VOLUME_ATLAS_FORMAT } from "./constants";

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
};

export type VolumeAtlasDictionary = {
  [key: string]: VolumeAtlasEntry;
};

const DEFAULT_ATLAS_SIZE = 8;

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
      mipLevelCount: 1,
    });
  }

  /** Get the dimensions of the atlas texture */
  get dimensions() {
    return vec3.create(
      this.#atlasTexture.width,
      this.#atlasTexture.height,
      this.#atlasTexture.depthOrArrayLayers,
    );
  }

  get dictionary() {
    return this.#dictionary;
  }

  addVolume = async (texture: GPUTexture, label: string) => {
    if (this.#dictionary[label]) {
      throw new Error(
        `Error adding volume to atlas: volume with label ${label} already exists`,
      );
    }

    const commandEncoder = this.#device.createCommandEncoder();
    const { width, height, depthOrArrayLayers } = texture;
    const roundedWidth = ceilToNearestMultipleOf(width, 8);
    const roundedHeight = ceilToNearestMultipleOf(height, 8);
    const roundedDepth = ceilToNearestMultipleOf(depthOrArrayLayers, 8);
    console.debug(`Adding ${label} to atlas`, {
      width,
      height,
      depthOrArrayLayers,
    });

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

    const newMipLevelCount = Math.max(
      texture.mipLevelCount,
      this.#atlasTexture.mipLevelCount,
    );
    console.debug(
      `Expanding atlas texture to [${newWidth}, ${newHeight}, ${newDepth}], mip levels: ${newMipLevelCount}`,
    );

    const newAtlasTexture = this.#device.createTexture({
      size: {
        width: newWidth,
        height: newHeight,
        depthOrArrayLayers: newDepth,
      },
      mipLevelCount: newMipLevelCount,
      ...descriptorPartial,
      label: `${this.#atlasTexture.label}, ${texture.label || "unnamed volume"}`,
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
      mipLevel < Math.min(texture.mipLevelCount, newAtlasTexture.mipLevelCount);
      mipLevel++
    ) {
      const mipWidth = Math.max(1, texture.width >> mipLevel);
      const mipHeight = Math.max(1, texture.height >> mipLevel);
      const mipDepth = Math.max(1, texture.depthOrArrayLayers >> mipLevel);
      commandEncoder.copyTextureToTexture(
        {
          texture: texture,
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

    this.#dictionary[label] = {
      location: [atlasLocationX, 0, 0],
      size: [width, height, depthOrArrayLayers],
    };

    // Prevents race condition between the copy and the write
    this.#device.queue.submit([commandEncoder.finish()]);
    await this.#device.queue.onSubmittedWorkDone();

    //TODO: adjust to use render pipeline to support 8 bit format
    // const zSliceTexture = await flipTexture(
    //   device,
    //   await flatten3dTexture(device, newAtlasTexture),
    // );
    // writeTextureToCanvas(device, "debug-canvas", zSliceTexture);
  };

  get atlasTextureView() {
    if (!this.#atlasTexture) {
      return null;
    }
    return this.#atlasTexture.createView({
      label: this.#atlasTexture.label,
    });
  }
}
