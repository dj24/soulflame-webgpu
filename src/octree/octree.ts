import { TVoxels } from "../convert-vxm";

export const getOctreeDepthFromVoxelBounds = (size: TVoxels["SIZE"]) => {
  return Math.ceil(Math.log2(Math.max(...size)));
};

export const octantIndexToOffset = (index: number) => {
  return [index & 1 ? 1 : 0, index & 2 ? 1 : 0, index & 4 ? 1 : 0];
};

export const getOctantSizeFromDepth = (
  depth: number,
  voxelObjectSize: [x: number, y: number, z: number],
) => {
  const largestLength = Math.max(...voxelObjectSize);
  return Math.ceil(largestLength / 2 ** depth);
};

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
    this.#build(voxels, 0);
  }

  #build(voxels: TVoxels, startIndex: number) {
    const isLeaf = voxels.XYZI.length === 1;
    let childMask = 0;
    if (isLeaf) {
      // TODO: handle leaf
      this.nodes[startIndex] = {
        childMask,
        voxels,
        firstChildIndex: -1,
      };
      return;
    }
    // Check if there are any voxels in each of the 8 children, if so, increment the childIndex
    Array.from({ length: 8 }).forEach((_, i) => {
      const offset = octantIndexToOffset(i);
    });
  }
}
