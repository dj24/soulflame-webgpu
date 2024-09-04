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
    label: string,
    size: Vec3,
    octreeArrayBuffer: ArrayBuffer,
  ) => {
    if (this.#dictionary[label]) {
      throw new Error(
        `Error adding volume to atlas: volume with label ${label} already exists`,
      );
    }

    const commandEncoder = this.#device.createCommandEncoder();

    const [width, height, depth] = size;

    const bufferIndexForNewVolume = this.#octreeBuffer.size / 8;

    this.#dictionary[label] = {
      location: [0, 0, 0],
      size: [width, height, depth],
      paletteIndex: 0,
      octreeOffset: bufferIndexForNewVolume,
      octreeSizeBytes: octreeArrayBuffer.byteLength,
      textureSizeBytes: width * height * depth,
    };

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

    this.#device.queue.submit([commandEncoder.finish()]);

    console.log(
      `total octree buffer size: ${(this.#octreeBuffer.size / 1024 / 1024).toFixed(2)}MB`,
    );

    // write new data to the new buffer
    this.#device.queue.writeBuffer(
      newOctreeBuffer,
      this.#octreeBuffer.size,
      octreeArrayBuffer,
    );

    await this.#device.queue.onSubmittedWorkDone();

    this.#octreeBuffer = newOctreeBuffer;

    this.#octreeBuffer.unmap();
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
