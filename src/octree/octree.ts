import { TVoxels } from "../convert-vxm";
import { getBit, setBit, setBitLE } from "./bitmask";

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

export const bytesToMB = (bytes: number) => {
  return bytes / 1024 / 1024;
};

export const bitmaskToString = (bitmask: number) => {
  return bitmask.toString(2).padStart(8, "0");
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

export const getClosestOctantIndex = (
  position: [x: number, y: number, z: number],
  centerOfNode: [x: number, y: number, z: number],
) => {
  let orientedPositionX = position[0] - centerOfNode[0];
  let orientedPositionY = position[1] - centerOfNode[1];
  let orientedPositionZ = position[2] - centerOfNode[2];
  let xTest = orientedPositionX >= 0 ? 1 : 0;
  let yTest = orientedPositionY >= 0 ? 1 : 0;
  let zTest = orientedPositionZ >= 0 ? 1 : 0;
  return xTest | (yTest << 1) | (zTest << 2);
};

const ceilToNextPowerOfTwo = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export type InternalNode = {
  /** index of the first child node */
  firstChildIndex: number;
  /** bitmask of which children are present */
  childMask: number;
  /** voxels contained within this node */
  leafMask: number;
  voxels: TVoxels;
};

export type LeafNode = {
  /** 0 if this is a leaf node */
  leafFlag: 0;
  /** index of the palette color */
  paletteIndex: number;
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

      const octantVoxels = voxels.XYZI.filter(
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
          VOX: voxels.VOX,
        };
      }
    }

    // Count the number of valid child octants, so we know how many child nodes to allocate
    let requiredChildNodes = 0;

    // Once we have the valid child octants, create a node for the current octant
    const childMask = childOctants.reduce((mask, octantVoxels, i) => {
      if (octantVoxels) {
        requiredChildNodes = i + 1;
        return setBit(mask, i);
        // return setBitLE(mask, i);
      }
      return mask;
    }, 0);

    const isAllSameColor = voxels.XYZI.every(
      (voxel) => voxel.c === voxels.XYZI[0].c,
    );

    const isParentToMaxDepth = childDepth === this.#maxDepth - 1;

    // If all child octants are filled with the same colour, and we are one level from the smallest voxels, this is a leaf (solid) node
    // if (childMask === 255 && isAllSameColor && isParentToMaxDepth) {
    //   this.nodes[startIndex] = {
    //     leafFlag: 0,
    //     paletteIndex: voxels.XYZI[0].c,
    //   };
    //   return;
    // }

    // Allocate memory for 8 child nodes
    const firstChildIndex = this.#mallocOctant(requiredChildNodes);

    let leafMask = 0;

    childOctants.forEach((octantVoxels, i) => {
      if (octantVoxels) {
        const isLeaf = octantVoxels.SIZE[0] === 1;
        const childIndex = firstChildIndex + i;
        // Leaf node
        if (isLeaf) {
          this.nodes[childIndex] = {
            leafFlag: 0,
            paletteIndex: octantVoxels.XYZI[0].c,
          };
          leafMask = setBit(leafMask, i);
        } else {
          const origin = octantIndexToOffset(i);
          const x = offset[0] + origin[0] * childOctantSize;
          const y = offset[1] + origin[1] * childOctantSize;
          const z = offset[2] + origin[2] * childOctantSize;
          this.#build(octantVoxels, childIndex, [x, y, z], childDepth);
        }
      }
    });

    // Create the parent node
    this.nodes[startIndex] = {
      firstChildIndex,
      childMask,
      leafMask,
      voxels: { ...voxels, SIZE: [objectSize, objectSize, objectSize] },
    };
  }

  get totalSize() {
    return this.nodes.length * 4;
  }
}

export const octreeToArrayBuffer = (octree: Octree) => {
  const strideBytes = 4;
  const buffer = new ArrayBuffer(octree.totalSize);
  const view = new DataView(buffer);

  octree.nodes.forEach((node, i) => {
    if ("leafFlag" in node) {
      console.log(`Setting leaf node at ${i} with colour ${node.paletteIndex}`);
      view.setUint8(i * strideBytes, 0);
      view.setUint8(i * strideBytes + 1, node.paletteIndex);
    } else {
      if (i < 4) {
        console.log(
          `Setting internal node at ${i} with firstChildIndex ${node.firstChildIndex} and childMask ${bitmaskToString(node.childMask)}`,
        );
      }
      const relativeIndex = node.firstChildIndex - i;
      view.setUint16(i * strideBytes, relativeIndex, true);
      view.setUint8(i * strideBytes + 2, node.childMask);
      view.setUint8(i * strideBytes + 3, node.leafMask);
    }
  });

  return buffer;
};

/** traverse an octree at a given point, to see if it contains a voxel */
export const traverseOctreeAtPoint = (
  octree: Octree,
  x: number,
  y: number,
  z: number,
) => {
  let node = octree.nodes[0];
  let depth = 0;
  while (node && "firstChildIndex" in node) {
    const objectSize = node.voxels.SIZE[0];
    const childOctantSize = objectSize / 2;
    const octantIndex =
      (x >= childOctantSize ? 1 : 0) +
      (y >= childOctantSize ? 2 : 0) +
      (z >= childOctantSize ? 4 : 0);
    if (getBit(node.childMask, octantIndex)) {
      const childIndex = node.firstChildIndex + octantIndex;
      node = octree.nodes[childIndex];
      depth++;
    } else {
      return null;
    }
  }

  return {
    node,
    depth,
  };
};
