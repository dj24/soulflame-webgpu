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
  /** bitmask of which children are leaf nodes */
  leafMask: number;
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
    console.log(this.nodes.slice(0, 20));
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

    let leafMask = 0;

    childOctants.forEach((octantVoxels, i) => {
      if (octantVoxels) {
        const childIndex = firstChildIndex + i;
        const origin = octantIndexToOffset(i);
        const x = offset[0] + origin[0] * childOctantSize;
        const y = offset[1] + origin[1] * childOctantSize;
        const z = offset[2] + origin[2] * childOctantSize;
        if (octantVoxels.XYZI.length === 1 && childDepth == this.#maxDepth) {
          leafMask = setBit(leafMask, i);
        }
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
      leafMask,
    };
  }

  get totalSize() {
    return this.nodes.length * OCTREE_STRIDE;
  }
}

export const setLeafNode = (
  dataView: DataView,
  index: number,
  node: LeafNode,
) => {
  dataView.setUint16(index * OCTREE_STRIDE, 0);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.red);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.green);
  dataView.setUint8(index * OCTREE_STRIDE + 4, node.blue);
};

export const setInternalNode = (
  dataView: DataView,
  index: number,
  node: InternalNode,
) => {
  console.assert(
    node.firstChildIndex < 65536,
    `First child index of ${node.firstChildIndex} is too large to fit in 2 bytes`,
  );
  //TODO: try 24 bit unisnged integer by using bit shifting
  dataView.setUint16(index * OCTREE_STRIDE, node.firstChildIndex);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.childMask);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.leafMask);
  dataView.setUint8(index * OCTREE_STRIDE + 4, node.x);
  dataView.setUint8(index * OCTREE_STRIDE + 5, node.y);
  dataView.setUint8(index * OCTREE_STRIDE + 6, node.z);
  dataView.setUint8(index * OCTREE_STRIDE + 7, node.size);
  if (index === 0) {
    console.log(node.size);
  }
};

export const octreeToArrayBuffer = (octree: Octree) => {
  const buffer = new ArrayBuffer(octree.totalSize);
  const view = new DataView(buffer);

  octree.nodes.forEach((node, i) => {
    if ("red" in node) {
      setLeafNode(view, i, node);
    } else {
      setInternalNode(view, i, node);
    }
  });

  console.debug(
    `Created octree of size ${(octree.totalSize / 1024 ** 2).toFixed(2)} MB`,
  );

  return buffer;
};
