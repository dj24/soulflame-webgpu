import { setBit } from "./bitmask";
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
export class Octree {
  readonly nodes: OctreeNode[];
  #pointer: number;
  #getVoxel: GetVoxel;
  #getMinVoxelSize: GetMinimumVoxelSize;
  #dataView: DataView;

  constructor(
    getVoxel: GetVoxel,
    getMinVoxelSize: GetMinimumVoxelSize,
    size: number,
    buffer: SharedArrayBuffer,
  ) {
    this.nodes = [];
    this.#pointer = 0;
    this.#dataView = new DataView(buffer);
    this.#getVoxel = getVoxel;
    this.#getMinVoxelSize = getMinVoxelSize;
    this.#build(size, 0, [0, 0, 0]);
  }

  // Allocate memory for 8 nodes, and return the index of the first node
  #mallocOctant(nodeCount = 8) {
    this.#pointer += nodeCount;
    return this.#pointer - (nodeCount - 1);
  }

  #build(
    size: number,
    startIndex: number,
    offset: [x: number, y: number, z: number],
  ) {
    const isLeaf =
      size <= this.#getMinVoxelSize(offset[0], offset[1], offset[2]);

    if (isLeaf) {
      const voxel = this.#getVoxel(offset[0], offset[1], offset[2]);

      const { red, green, blue } = voxel;
      const node = {
        red,
        green,
        blue,
        x: offset[0],
        y: offset[1],
        z: offset[2],
        size,
      };
      setLeafNode(this.#dataView, startIndex, node);
      return;
    }

    // The voxels contained within each child octant
    const childOctantsVoxelCount: number[] = Array.from({ length: 8 }, () => 0);
    const objectSize = ceilToNextPowerOfTwo(size);
    const childOctantSize = objectSize / 2;

    // For each child octant, check if it contains any voxels
    for (let i = 0; i < 8; i++) {
      const origin = octantIndexToOffset(i);
      const x = offset[0] + origin[0] * childOctantSize;
      const y = offset[1] + origin[1] * childOctantSize;
      const z = offset[2] + origin[2] * childOctantSize;
      for (let octantX = x; octantX < x + childOctantSize; octantX++) {
        for (let octantY = y; octantY < y + childOctantSize; octantY++) {
          for (let octantZ = z; octantZ < z + childOctantSize; octantZ++) {
            if (this.#getVoxel(octantX, octantY, octantZ)) {
              childOctantsVoxelCount[i]++;
            }
          }
        }
      }
    }
    // We can save space by only allocating up to the last child node
    let requiredChildNodes = 0;

    // Once we have the valid child octants, create a node for the current octant
    const childMask = childOctantsVoxelCount.reduce((mask, octantVoxels, i) => {
      if (octantVoxels > 0) {
        requiredChildNodes = i + 1;
        return setBit(mask, i);
      }
      return mask;
    }, 0);

    const totalVoxels = childOctantsVoxelCount.reduce(
      (total, octantVoxels) => total + octantVoxels,
      0,
    );

    const isAllVoxelsFilled = totalVoxels === objectSize ** 3;

    if (isAllVoxelsFilled) {
      const centerOfOctant = offset.map((o) => o + objectSize / 2);
      const { red, green, blue } = this.#getVoxel(
        centerOfOctant[0],
        centerOfOctant[1],
        centerOfOctant[2],
      );
      const node = {
        red,
        green,
        blue,
        x: offset[0],
        y: offset[1],
        z: offset[2],
        size,
      };
      setLeafNode(this.#dataView, startIndex, node);
      return;
    }

    // Allocate memory for child nodes
    const firstChildIndex = this.#mallocOctant(requiredChildNodes);
    const relativeIndex = firstChildIndex - startIndex;

    childOctantsVoxelCount.forEach((octantVoxels, i) => {
      if (octantVoxels) {
        const childIndex = firstChildIndex + i;
        const origin = octantIndexToOffset(i);
        const x = offset[0] + origin[0] * childOctantSize;
        const y = offset[1] + origin[1] * childOctantSize;
        const z = offset[2] + origin[2] * childOctantSize;
        this.#build(childOctantSize, childIndex, [x, y, z]);
      }
    });

    // Create the parent node
    const node = {
      firstChildIndex: relativeIndex,
      childMask,
      x: offset[0],
      y: offset[1],
      z: offset[2],
      size: objectSize,
    };
    setInternalNode(this.#dataView, startIndex, node);
  }

  get totalSizeBytes() {
    return this.#pointer * OCTREE_STRIDE;
  }
}

export const setLeafNode = (
  dataView: DataView,
  index: number,
  node: LeafNode,
) => {
  dataView.setUint8(index * OCTREE_STRIDE, 0);
  dataView.setUint8(index * OCTREE_STRIDE + 1, node.x);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.y);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.z);
  dataView.setUint8(index * OCTREE_STRIDE + 4, node.red);
  dataView.setUint8(index * OCTREE_STRIDE + 5, node.green);
  dataView.setUint8(index * OCTREE_STRIDE + 6, node.blue);
  dataView.setUint8(index * OCTREE_STRIDE + 7, Math.log2(node.size));
};

export const setInternalNode = (
  dataView: DataView,
  index: number,
  node: InternalNode,
) => {
  console.assert(
    node.firstChildIndex < 2 ** 24 - 1,
    `First child index of ${node.firstChildIndex} is too large to fit in 3 bytes`,
  );
  console.assert(
    node.x < 2 ** 8,
    `X position of ${node.x} is too large to fit in 1 byte`,
  );
  console.assert(
    node.y < 2 ** 8,
    `Y position of ${node.y} is too large to fit in 1 byte`,
  );
  console.assert(
    node.z < 2 ** 8,
    `Z position of ${node.z} is too large to fit in 1 byte`,
  );
  dataView.setUint8(index * OCTREE_STRIDE, node.childMask);
  dataView.setUint8(index * OCTREE_STRIDE + 1, node.x);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.y);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.z);
  dataView.setUint32(index * OCTREE_STRIDE + 4, node.firstChildIndex, true);
  dataView.setUint8(index * OCTREE_STRIDE + 7, Math.log2(node.size));
};