import { TVoxels } from "../convert-vxm";
import { setBitLE } from "./bitmask";

/** Returns the depth of the octree required to contain the given voxel bounds */
export const getOctreeDepthFromVoxelBounds = (size: TVoxels["SIZE"]) => {
  return Math.ceil(Math.log2(Math.max(...size)));
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

/** Returns a bitmask of which children are present in the octant
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
export const getChildMask = (
  voxels: TVoxels,
  octantSize: number,
  origin: [x: number, y: number, z: number],
) => {
  let mask = 0b00000000;
  for (let i = 0; i < 8; i++) {
    const offset = octantIndexToOffset(i);
    const x = origin[0] + offset[0] * octantSize;
    const y = origin[1] + offset[1] * octantSize;
    const z = origin[2] + offset[2] * octantSize;
    const isVoxelInOctant = voxels.XYZI.some((voxel) => {
      return (
        voxel.x >= x &&
        voxel.x < x + octantSize &&
        voxel.y >= y &&
        voxel.y < y + octantSize &&
        voxel.z >= z &&
        voxel.z < z + octantSize
      );
    });
    if (isVoxelInOctant) {
      mask = setBitLE(mask, i);
    }
  }
  return mask;
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
    const childMask = 0b00000000;
    const firstChildIndex = this.#startIndex;
  }
}
