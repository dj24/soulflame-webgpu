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
 * Handles construction of an Octree for a single voxel object.
 */
export class Octree {
  readonly nodes: OctreeNode[];

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
    // The voxels contained within each child octant
    const childOctants: (TVoxels | null)[] = Array.from(
      { length: 8 },
      () => null,
    );
    const childDepth = depth + 1;
    const childOctantSize = getOctantSizeFromDepth(childDepth, voxels.SIZE);

    // For each child octant, check if it contains any voxels
    for (let i = 0; i < 8; i++) {
      const origin = getOctantOriginFromDepthAndIndex(
        childDepth,
        i,
        voxels.SIZE,
        offset,
      );
      const octantVoxels = voxels.XYZI.filter(
        (voxel) =>
          voxel.x >= origin[0] &&
          voxel.x < origin[0] + childOctantSize &&
          voxel.y >= origin[1] &&
          voxel.y < origin[1] + childOctantSize &&
          voxel.z >= origin[2] &&
          voxel.z < origin[2] + childOctantSize,
      );
      console.log({
        i,
        voxels: voxels.XYZI,
        origin,
        childDepth,
        childOctantSize,
      });
      if (octantVoxels.length > 0) {
        childOctants[i] = {
          SIZE: [childOctantSize, childOctantSize, childOctantSize],
          XYZI: octantVoxels,
          RGBA: voxels.RGBA,
          VOX: voxels.VOX,
        };
      }
    }

    /* Once we have the valid child octants, create a node for the current octant
     * and recurse into the valid child octants */
    const childMask = childOctants.reduce((mask, octantVoxels, i) => {
      return octantVoxels ? setBitLE(mask, i) : mask;
    }, 0);

    const firstChildIndex = startIndex * 8;
    this.nodes[startIndex] = {
      firstChildIndex,
      childMask,
      voxels,
    };
    // If the current octant has no children, return
    if (childMask === 0) {
      return;
    }

    // Leaf nodes are octants with a size of 1
    if (childOctantSize === 1) {
      childOctants.forEach((octantVoxels, i) => {
        if (!octantVoxels) {
          return;
        }
        this.nodes[firstChildIndex + i] = {
          firstChildIndex: -1,
          childMask: 0,
          voxels: octantVoxels,
        };
      });
    }
    // Otherwise, recurse into the child octants
    else {
      childOctants.forEach((octantVoxels, i) => {
        if (!octantVoxels) {
          return;
        }
        const [x, y, z] = getOctantOriginFromDepthAndIndex(
          depth + 1,
          i,
          octantVoxels.SIZE,
          offset,
        );
        console.log({ origin: [x, y, z], depth: depth + 1, i });
        this.#build(octantVoxels, firstChildIndex + i, [x, y, z], depth + 1);
      });
    }
  }
}
