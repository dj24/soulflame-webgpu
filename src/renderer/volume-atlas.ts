import { Vec3 } from "wgpu-matrix";
import { VOLUME_ATLAS_FORMAT, VOLUME_MIP_LEVELS } from "./constants";
import { Mutex } from "async-mutex";
import { Controller } from "lil-gui";
import { VoxelObject } from "@renderer/voxel-object";
import { OCTREE_STRIDE } from "@renderer/octree/octree";
import { device } from "@renderer/app";

const descriptorPartial: Omit<GPUTextureDescriptor, "size"> = {
  format: VOLUME_ATLAS_FORMAT,
  usage:
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.TEXTURE_BINDING,
  dimension: "3d",
};

type VolumeAtlasEntry = {
  /** The size of the volume in the atlas texture */
  size: Vec3;
  /** The offset of the octree in the octree buffer */
  octreeOffset: number;
  /** The size of the octree in the octree buffer in bytes */
  octreeSizeBytes: number;
};

export type VolumeAtlasDictionary = {
  [key: string]: VolumeAtlasEntry;
};

const folder = (window as any).debugUI.gui.addFolder("volume atlas");
folder.close();
const MIN_VOLUME_SIZE = Math.pow(2, VOLUME_MIP_LEVELS - 1);
const DEFAULT_ATLAS_SIZE = MIN_VOLUME_SIZE;
const PALETTE_WIDTH = 256;

/** A class representing a volume atlas for storing multiple 3D textures.
 *
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
  #mutex = new Mutex();

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
    folder.add(this, "octreeBufferSizeMB").listen().name("octree buffer size");
  }

  get dictionary() {
    return this.#dictionary;
  }

  addVolumes = async (voxelObjects: VoxelObject[]) => {
    const totalSize = voxelObjects.reduce(
      (acc, obj) => acc + obj.gpuBuffer.size,
      0,
    );
    const commandEncoder = this.#device.createCommandEncoder();
    this.#octreeBuffer.destroy();
    this.#octreeBuffer = this.#device.createBuffer({
      label: "Octree buffer",
      size: 8 + totalSize,
      usage: this.#octreeBuffer.usage,
    });
    let offset = 0;
    for (const voxelObject of voxelObjects) {
      const { name, size, gpuBuffer } = voxelObject;
      const bufferIndexForNewVolume = offset / OCTREE_STRIDE;
      this.#dictionary[name] = {
        size,
        octreeOffset: bufferIndexForNewVolume,
        octreeSizeBytes: gpuBuffer.size,
      };
      voxelObject.octreeBufferIndex = bufferIndexForNewVolume;
      commandEncoder.copyBufferToBuffer(
        gpuBuffer,
        0,
        this.#octreeBuffer,
        offset,
        gpuBuffer.size,
      );
      offset += gpuBuffer.size;
    }
    device.queue.submit([commandEncoder.finish()]);
  };

  addOrReplaceVolume = async (
    label: string,
    size: Vec3,
    octreeArrayBuffer: ArrayBuffer,
    sizeBytes?: number,
  ) => {
    await this.#mutex.runExclusive(async () => {
      const commandEncoder = this.#device.createCommandEncoder();
      const [width, height, depth] = size;
      const bufferIndexForNewVolume = this.#octreeBuffer.size / 8;
      const octreeSizeBytes = sizeBytes || octreeArrayBuffer.byteLength;

      this.#dictionary[label] = {
        size: [width, height, depth],
        octreeOffset: bufferIndexForNewVolume,
        octreeSizeBytes,
      };

      folder
        .add(
          {
            mb: `${(octreeSizeBytes / 1024 ** 2).toFixed(2)}MB`,
          },
          "mb",
        )
        .name(label);

      // Resize the octree buffer to fit the new data
      const newOctreeBuffer = this.#device.createBuffer({
        label: "Octree buffer",
        size: this.#octreeBuffer.size + octreeSizeBytes,
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

      // write new data to the new buffer
      this.#device.queue.writeBuffer(
        newOctreeBuffer,
        this.#octreeBuffer.size,
        octreeArrayBuffer,
        0,
        octreeSizeBytes,
      );

      await this.#device.queue.onSubmittedWorkDone();
      this.#octreeBuffer = newOctreeBuffer;
      this.#octreeBuffer.unmap();
    });
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

  get octreeBufferSizeMB() {
    return (this.#octreeBuffer.size / 1024 ** 2).toFixed(2);
  }
}
