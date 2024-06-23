import { TVoxels } from "../convert-vxm";
import { setBitLE } from "./bitmask";

/** Returns the depth of the octree required to contain the given voxel bounds */
export const getOctreeDepthFromVoxelBounds = (size: TVoxels["SIZE"]) => {
  return Math.ceil(Math.log2(Math.max(...size)));
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

type OctreeNode = {
  /** index of the first child node */
  firstChildIndex: number;
  /** bitmask of which children are present */
  childMask: number;
  voxels: TVoxels;
};

/**
 * Handles construction of an Octree for a single voxel object.
 */
export class Octree {
  readonly nodes: OctreeNode[];
  #pointer: number;

  constructor(voxels: TVoxels) {
    this.nodes = [];
    this.#pointer = 0;
    this.#build(voxels, 0, [0, 0, 0], 0);
  }

  // Allocate memory for 8 nodes, and return the index of the first node
  #mallocOctant() {
    this.#pointer += 8;
    return this.#pointer - 7;
  }

  #build(
    voxels: TVoxels,
    startIndex: number,
    offset: [x: number, y: number, z: number],
    depth: number,
  ) {
    if (depth === 2) {
      console.log({ startIndex, offset, depth });
    }

    // The voxels contained within each child octant
    const childOctants: (TVoxels | null)[] = Array.from(
      { length: 8 },
      () => null,
    );
    const childDepth = depth + 1;

    const childOctantSize = voxels.SIZE[0] / 2;

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

    // Once we have the valid child octants, create a node for the current octant
    const childMask = childOctants.reduce((mask, octantVoxels, i) => {
      return octantVoxels ? setBitLE(mask, i) : mask;
    }, 0);

    // Allocate memory for 8 child nodes
    const firstChildIndex = this.#mallocOctant();

    // Create the parent node
    this.nodes[startIndex] = {
      firstChildIndex,
      childMask,
      voxels,
    };

    childOctants.forEach((octantVoxels, i) => {
      if (octantVoxels) {
        const isLeaf = octantVoxels.SIZE[0] === 1;
        const childIndex = firstChildIndex + i;
        // Leaf node
        if (isLeaf) {
          this.nodes[childIndex] = {
            firstChildIndex: -1,
            childMask: 0,
            voxels: octantVoxels,
          };
        } else {
          const origin = octantIndexToOffset(i);
          const x = (origin[0] * voxels.SIZE[0]) / 2;
          const y = (origin[1] * voxels.SIZE[1]) / 2;
          const z = (origin[2] * voxels.SIZE[2]) / 2;
          this.#build(octantVoxels, childIndex, [x, y, z], childDepth);
        }
      }
    });
  }

  get totalSize() {
    return this.nodes.length * 4;
  }
}
