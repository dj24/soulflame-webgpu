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

/**
 * Returns the size of an octant at a given depth
 * Octants are always cubic, so the root node will often be larger than the bounds of the voxel object
 * @param depth - depth of the octant
 * @param voxelObjectSize - overall size of the voxel object
 */
export const getOctantSizeFromDepth = (
  depth: number,
  voxelObjectSize: [x: number, y: number, z: number],
) => {
  const largestLength = Math.max(...voxelObjectSize);
  return Math.ceil(largestLength / 2 ** depth);
};

export const getChildNodeIndex = (node: OctreeNode, childIndex: number) => {
  return node.firstChildIndex + childIndex;
};

/** Returns the origin of an octant at a given depth and index
 * @param depth - depth of the octant
 * @param index - index of the octant
 * @param voxelObjectSize - overall size of the voxel object
 * @param parentOrigin - origin of the parent octant
 */
export const getOctantOriginFromDepthAndIndex = (
  depth: number,
  index: number,
  voxelObjectSize: [x: number, y: number, z: number],
  parentOrigin: [x: number, y: number, z: number] = [0, 0, 0],
) => {
  const size = getOctantSizeFromDepth(depth, voxelObjectSize);
  const offset = octantIndexToOffset(index);
  const scaledOffset = offset.map((o) => o * size);
  return [
    parentOrigin[0] + scaledOffset[0],
    parentOrigin[1] + scaledOffset[1],
    parentOrigin[2] + scaledOffset[2],
  ];
};

type OctreeNode = {
  /** index of the first child node */
  firstChildIndex: number;
  /** bitmask of which children are present */
  childMask: number;
  voxels: TVoxels;
};

/**
 * Handles construction and GPU serialisation of an Octree for a single voxel object.
 */
export class Octree {
  readonly nodes: OctreeNode[];
  #startIndex = 0;

  constructor(voxels: TVoxels) {
    this.nodes = [];
    this.#build(voxels, 0, [0, 0, 0], 0);
  }

  #build(
    voxels: TVoxels,
    startIndex: number,
    offset: [x: number, y: number, z: number],
    depth: number,
  ) {
    const validChildVoxels = [];
    const octantSize = getOctantSizeFromDepth(depth + 1, voxels.SIZE);
    // For each child octant, check if it contains any voxels
    for (let i = 0; i < 8; i++) {
      const origin = getOctantOriginFromDepthAndIndex(
        depth + 1,
        i,
        voxels.SIZE,
        offset,
      );
      if (
        voxels.XYZI.some((voxel) => {
          return (
            voxel.x >= origin[0] &&
            voxel.x < origin[0] + octantSize &&
            voxel.y >= origin[1] &&
            voxel.y < origin[1] + octantSize &&
            voxel.z >= origin[2] &&
            voxel.z < origin[2] + octantSize
          );
        })
      ) {
        validChildVoxels.push(i);
      }
    }
    /* Once we have the valid child octants, create a node for the current octant
     * and recurse into the valid child octants */
    const childMask = validChildVoxels.reduce((mask, i) => {
      return setBitLE(mask, i);
    }, 0);

    const firstChildIndex = this.#startIndex;

    this.nodes[this.#startIndex] = {
      firstChildIndex,
      childMask,
      voxels,
    };

    validChildVoxels.forEach((i) => {
      const origin = getOctantOriginFromDepthAndIndex(
        depth + 1,
        i,
        voxels.SIZE,
        offset,
      );
      this.#build(
        voxels,
        firstChildIndex + i,
        [origin[0], origin[1], origin[2]],
        depth + 1,
      );
    });
  }
}
