import { TVoxels } from "../convert-vxm";
import { setBit } from "./bitmask";

export const octantPositions = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];

/** Returns the depth of the octree required to contain the given voxel bounds */
export const getOctreeDepthFromVoxelBounds = (size: TVoxels["SIZE"]) => {
  return Math.ceil(Math.log2(Math.max(...size)));
};

const OCTREE_STRIDE = 8;

export const bitmaskToString = (bitmask: number, bits = 8) => {
  return bitmask.toString(2).padStart(bits, "0");
};

export const bitmaskToStringLE = (bitmask: number, bits = 8) => {
  return bitmask.toString(2).padStart(bits, "0").split("").reverse().join("");
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
  /** voxels contained within this node */
  voxels: TVoxels;
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
  /** 0 if this is a leaf node */
  leafFlag: 0;
  /** 0-255 red value */
  red: number;
  /** 0-255 green value */
  green: number;
  /** 0-255 blue value */
  blue: number;
};

type OctreeNode = InternalNode | LeafNode;

/**
 * Handles construction of an Octree for a single voxel object.
 */
export class Octree {
  readonly nodes: OctreeNode[];
  #pointer: number;
  #maxDepth: number;

  constructor(voxels: TVoxels) {
    this.nodes = [];
    this.#pointer = 0;
    this.#maxDepth = getOctreeDepthFromVoxelBounds(voxels.SIZE);
    this.#build(voxels, 0, [0, 0, 0], 0);
  }

  // Allocate memory for 8 nodes, and return the index of the first node
  #mallocOctant(nodeCount = 8) {
    this.#pointer += nodeCount;
    return this.#pointer - (nodeCount - 1);
  }

  #build(
    voxels: TVoxels,
    startIndex: number,
    offset: [x: number, y: number, z: number],
    depth: number,
  ) {
    // Only one voxel in this octant, so it's a leaf node
    const isLeaf = voxels.XYZI.length === 1;
    if (isLeaf) {
      const paletteIndex = voxels.XYZI[0].c;
      this.nodes[startIndex] = {
        leafFlag: 0,
        red: voxels.RGBA[paletteIndex].r,
        green: voxels.RGBA[paletteIndex].g,
        blue: voxels.RGBA[paletteIndex].b,
      };
      return;
    }

    // The voxels contained within each child octant
    const childOctants: (TVoxels | null)[] = Array.from(
      { length: 8 },
      () => null,
    );
    const childDepth = depth + 1;
    const objectSize = ceilToNextPowerOfTwo(Math.max(...voxels.SIZE));
    const childOctantSize = objectSize / 2;

    // For each child octant, check if it contains any voxels
    for (let i = 0; i < 8; i++) {
      const origin = octantIndexToOffset(i);
      const x = offset[0] + origin[0] * childOctantSize;
      const y = offset[1] + origin[1] * childOctantSize;
      const z = offset[2] + origin[2] * childOctantSize;

      const octantVoxels: TVoxels["XYZI"] = voxels.XYZI.filter(
        (voxel) =>
          voxel.x >= x &&
          voxel.x < x + childOctantSize &&
          voxel.y >= y &&
          voxel.y < y + childOctantSize &&
          voxel.z >= z &&
          voxel.z < z + childOctantSize,
      );

      if (octantVoxels.length > 0) {
        childOctants[i] = {
          SIZE: [childOctantSize, childOctantSize, childOctantSize],
          XYZI: octantVoxels,
          RGBA: voxels.RGBA,
          VOX: octantVoxels.length,
        };
      }
    }

    // Once we have the valid child octants, create a node for the current octant
    const childMask = childOctants.reduce((mask, octantVoxels, i) => {
      if (octantVoxels) {
        return setBit(mask, i);
        // return setBitLE(mask, i);
      }
      return mask;
    }, 0);

    // Allocate memory for 8 child nodes
    const firstChildIndex = this.#mallocOctant();
    const relativeIndex = firstChildIndex - startIndex;

    childOctants.forEach((octantVoxels, i) => {
      if (octantVoxels) {
        const childIndex = firstChildIndex + i;
        const origin = octantIndexToOffset(i);
        const x = offset[0] + origin[0] * childOctantSize;
        const y = offset[1] + origin[1] * childOctantSize;
        const z = offset[2] + origin[2] * childOctantSize;
        this.#build(octantVoxels, childIndex, [x, y, z], childDepth);
      }
    });

    // Create the parent node
    this.nodes[startIndex] = {
      firstChildIndex: relativeIndex,
      childMask,
      voxels: { ...voxels, SIZE: [objectSize, objectSize, objectSize] },
      x: offset[0],
      y: offset[1],
      z: offset[2],
      size: objectSize,
    };
  }

  get totalSize() {
    return this.nodes.length * OCTREE_STRIDE;
  }
}

const setLeafNode = (dataView: DataView, index: number, node: LeafNode) => {
  dataView.setUint8(index * OCTREE_STRIDE, node.leafFlag);
  dataView.setUint8(index * OCTREE_STRIDE + 1, node.red);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.green);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.blue);
};

export const setInternalNode = (
  dataView: DataView,
  index: number,
  node: InternalNode,
) => {
  dataView.setUint8(index * OCTREE_STRIDE + 1, node.firstChildIndex);
  dataView.setUint8(index * OCTREE_STRIDE, node.childMask);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.x);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.y);
  dataView.setUint8(index * OCTREE_STRIDE + 4, node.z);
};

export const octreeToArrayBuffer = (octree: Octree) => {
  const buffer = new ArrayBuffer(octree.totalSize);
  const view = new DataView(buffer);

  octree.nodes.forEach((node, i) => {
    if ("leafFlag" in node) {
      setLeafNode(view, i, node);
    } else {
      setInternalNode(view, i, node);
    }
  });

  return buffer;
};
