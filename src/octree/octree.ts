import { TVoxels } from "../convert-vxm";
import { setBitLE } from "./bitmask";

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

export type InternalNode = {
  /** index of the first child node */
  firstChildIndex: number;
  /** bitmask of which children are present */
  childMask: number;
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

  constructor(voxels: TVoxels) {
    this.nodes = [];
    this.#pointer = 0;
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

    // Count the number of valid child octants, so we know how many child nodes to allocate
    let requiredChildNodes = 0;

    // Once we have the valid child octants, create a node for the current octant
    const childMask = childOctants.reduce((mask, octantVoxels, i) => {
      if (octantVoxels) {
        requiredChildNodes = i + 1;
        return setBitLE(mask, i);
      }
      return mask;
    }, 0);

    const isAllSameColor = voxels.XYZI.every(
      (voxel) => voxel.c === voxels.XYZI[0].c,
    );

    // If all child octants are filled with the same colour, this is a leaf (solid) node
    if (childMask === 255 && isAllSameColor) {
      this.nodes[startIndex] = {
        leafFlag: 0,
        paletteIndex: voxels.XYZI[0].c,
      };
      return;
    }

    // Allocate memory for 8 child nodes
    const firstChildIndex = this.#mallocOctant(requiredChildNodes);

    // Create the parent node
    this.nodes[startIndex] = {
      firstChildIndex,
      childMask,
      voxels,
    };

    const childSize = voxels.SIZE[0] / 2;

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
        } else {
          const origin = octantIndexToOffset(i);
          const x = offset[0] + origin[0] * childSize;
          const y = offset[1] + origin[1] * childSize;
          const z = offset[2] + origin[2] * childSize;
          this.#build(octantVoxels, childIndex, [x, y, z], childDepth);
        }
      }
    });
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
      if (i < 4) {
        console.log(
          `Setting leaf node at ${i} with colour ${node.paletteIndex}}`,
        );
      }
      view.setUint8(i * strideBytes, 0);
      view.setUint8(i * strideBytes + 1, node.paletteIndex);
    } else {
      if (i < 4) {
        console.log(
          `Setting internal node at ${i} with firstChildIndex ${node.firstChildIndex} and childMask ${node.childMask}`,
        );
      }
      const relativeIndex = node.firstChildIndex - i;
      view.setUint16(i * strideBytes, relativeIndex, true);
      view.setUint8(i * strideBytes + 2, node.childMask);
    }
  });

  return buffer;
};
