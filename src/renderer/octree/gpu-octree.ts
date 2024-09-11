import { setBit } from "./bitmask";
import { NoiseCache } from "../../procgen/noise-cache";
export const OCTREE_STRIDE = 8;

export const bitmaskToString = (bitmask: number, bits = 8) => {
  return bitmask.toString(2).padStart(bits, "0");
};

/** Converts an octant index to an offset in the parent octant
 * Bits represent the following octants:
 *
 * 0 = [0,0,0]
 *
 * 1 = [1,0,0]
 *
 * 2 = [0,1,0]
 *
 * 3 = [1,1,0]
 *
 * 4 = [0,0,1]
 *
 * 5 = [1,0,1]
 *
 * 6 = [0,1,1]
 *
 * 7 = [1,1,1]
 */
export const octantIndexToOffset = (index: number) => {
  return [index & 1 ? 1 : 0, index & 2 ? 1 : 0, index & 4 ? 1 : 0];
};

const ceilToNextPowerOfTwo = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export type InternalNode = {
  /** index of the first child node */
  firstChildIndex: number;
  /** bitmask of which children are present */
  childMask: number;
  /** x position of the node */
  x: number;
  /** y position of the node */
  y: number;
  /** z position of the node */
  z: number;
  /** size of the node */
  size: number;
};

export type LeafNode = {
  /** 0-255 red value */
  red: number;
  /** 0-255 green value */
  green: number;
  /** 0-255 blue value */
  blue: number;
  /** x position of the node */
  x: number;
  /** y position of the node */
  y: number;
  /** z position of the node */
  z: number;
  /** size of the node */
  size: number;
};

type OctreeNode = InternalNode | LeafNode;

export type GetVoxel = (
  x: number,
  y: number,
  z: number,
) => { red: number; green: number; blue: number } | null;

export type GetMinimumVoxelSize = (x: number, y: number, z: number) => number;

/**
 * Handles construction of an Octree for a single voxel object.
 */
export class GPUOctree {
  #pointer: number;
  #getVoxel: GetVoxel;
  #getMinVoxelSize: GetMinimumVoxelSize;
  #dataView: DataView;
  #gpuDevice: GPUDevice;

  constructor(
    getVoxel: GetVoxel,
    getMinVoxelSize: GetMinimumVoxelSize,
    size: number,
    buffer: SharedArrayBuffer,
    device: GPUDevice,
    noiseCache: NoiseCache,
  ) {
    this.#pointer = 0;
    this.#dataView = new DataView(buffer);
    this.#gpuDevice = device;
    this.#getVoxel = getVoxel;
    this.#getMinVoxelSize = getMinVoxelSize;

    const requiredMips = Math.ceil(Math.log2(size));

    // Get noise field as buffer
    const noiseFieldBuffer = device.createBuffer({
      size: noiseCache.buffer.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // Create texture
    const childMaskTexture = device.createTexture({
      size: {
        width: size / 2,
        height: size / 2,
        depthOrArrayLayers: size / 2,
      },
      mipLevelCount: requiredMips - 1, // start at parent to avoid mip level 0
      format: "r8uint",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
    });

    // Copy noise field to buffer
    device.queue.writeBuffer(noiseFieldBuffer, 0, noiseCache.buffer);

    // Fill mip level 0 with the bitmask of the leaf nodes using the noise field
    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: childMaskTexture.createView({
            mipLevelCount: 1,
            baseMipLevel: 0,
          }),
          loadOp: "clear",
          clearValue: [0, 0, 0, 0],
          storeOp: "store",
        },
      ],
    });

    // TODO: Implement this

    renderPass.end();
  }

  totalSize = 0;
}
