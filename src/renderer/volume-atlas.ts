import { Vec3 } from "wgpu-matrix";
import { VOLUME_ATLAS_FORMAT, VOLUME_MIP_LEVELS } from "./constants";
import { writeTextureToCanvas } from "./write-texture-to-canvas";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { device } from "./app";

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
  /** The offset of the octree in the octree buffer */
  octreeOffset: number;
  /** The size of the octree in the octree buffer in bytes */
  octreeSizeBytes: number;
  /** The size of the texture in bytes */
  textureSizeBytes: number;
};

export type VolumeAtlasDictionary = {
  [key: string]: VolumeAtlasEntry;
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

const MIN_VOLUME_SIZE = Math.pow(2, VOLUME_MIP_LEVELS - 1);
const DEFAULT_ATLAS_SIZE = MIN_VOLUME_SIZE;
const PALETTE_WIDTH = 256;

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
  #atlasTextureView: GPUTextureView;
  #paletteTextureView: GPUTextureView;
  #octreeBuffer: GPUBuffer;

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
    this.#atlasTextureView = this.#atlasTexture.createView();
    this.#paletteTextureView = this.#paletteTexture.createView();
    this.#octreeBuffer = device.createBuffer({
      size: 0,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
      label: "Octree buffer",
    });
  }

  get dictionary() {
    return this.#dictionary;
  }

  addVolume = async (
    volume: GPUTexture,
    palette: GPUTexture,
    label: string,
    octreeArrayBuffer: ArrayBuffer,
  ) => {
    if (this.#dictionary[label]) {
      throw new Error(
        `Error adding volume to atlas: volume with label ${label} already exists`,
      );
    }

    const commandEncoder = this.#device.createCommandEncoder();

    const { width, height, depthOrArrayLayers } = volume;
    const roundedWidth = ceilToNearestMultipleOf(width, MIN_VOLUME_SIZE);
    const roundedHeight = ceilToNearestMultipleOf(height, MIN_VOLUME_SIZE);
    const roundedDepth = ceilToNearestMultipleOf(
      depthOrArrayLayers,
      MIN_VOLUME_SIZE,
    );

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

    commandEncoder.copyTextureToTexture(
      {
        texture: volume,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
      },
      {
        texture: newAtlasTexture,
        mipLevel: 0,
        origin: { x: atlasLocationX, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
      },
      {
        width: volume.width,
        height: volume.height,
        depthOrArrayLayers: volume.depthOrArrayLayers,
      },
    );

    this.#atlasTexture = newAtlasTexture;

    const paletteIndex = this.#paletteTexture.height;

    this.#dictionary[label] = {
      location: [atlasLocationX, 0, 0],
      size: [width, height, depthOrArrayLayers],
      paletteIndex,
      octreeOffset: this.#octreeBuffer.size,
      octreeSizeBytes: octreeArrayBuffer.byteLength,
      textureSizeBytes:
        volume.width * volume.height * volume.depthOrArrayLayers,
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

    // Resize the octree buffer to fit the new data
    const newOctreeBuffer = this.#device.createBuffer({
      label: "Octree buffer",
      size: this.#octreeBuffer.size + octreeArrayBuffer.byteLength,
      usage: this.#octreeBuffer.usage,
    });

    // write existing data to the new buffer
    commandEncoder.copyBufferToBuffer(
      this.#octreeBuffer,
      0,
      newOctreeBuffer,
      0,
      this.#octreeBuffer.size,
    );

    // write new data to the new buffer
    this.#device.queue.writeBuffer(
      newOctreeBuffer,
      this.#octreeBuffer.size,
      octreeArrayBuffer,
    );

    this.#device.queue.submit([commandEncoder.finish()]);

    await this.#device.queue.onSubmittedWorkDone();

    this.#octreeBuffer = newOctreeBuffer;

    this.#octreeBuffer.unmap();

    // DEBUG OCTREE
    {
      const copyOctreeBuffer = this.#device.createBuffer({
        label: "Octree buffer copy",
        size: this.#octreeBuffer.size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const copyCommandEncoder = this.#device.createCommandEncoder();
      copyCommandEncoder.copyBufferToBuffer(
        this.#octreeBuffer,
        0,
        copyOctreeBuffer,
        0,
        this.#octreeBuffer.size,
      );

      this.#device.queue.submit([copyCommandEncoder.finish()]);
      await this.#device.queue.onSubmittedWorkDone();
    }

    this.#atlasTexture = await generateOctreeMips(
      this.#device,
      this.#atlasTexture,
    );
    this.#atlasTextureView = this.#atlasTexture.createView();
    this.#paletteTextureView = this.#paletteTexture.createView();
  };

  get atlasTextureView() {
    return this.#atlasTextureView;
  }

  get paletteTextureView() {
    return this.#paletteTextureView;
  }

  get octreeBuffer() {
    return this.#octreeBuffer;
  }
}
