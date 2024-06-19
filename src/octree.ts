import { TVoxels } from "./convert-vxm";
import { Vec3 } from "wgpu-matrix";

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

export const getOctreeDepthFromVoxelBounds = (size: TVoxels["SIZE"]) => {
  return Math.ceil(Math.log2(Math.max(...size)));
};

type OctreeNode = {
  childIndices: number[];
  voxels: TVoxels;
  origin: Vec3;
};

/**
 * Handles construction and GPU serialisation of an Octree for a single voxel object.
 */
export class Octree {
  readonly nodes: OctreeNode[];
  #childIndex: number;

  constructor(voxels: TVoxels) {
    this.#childIndex = 0;
    this.nodes = [];
    this.#build(voxels, [0, 0, 0], 0);
  }

  #build(
    voxels: TVoxels,
    origin: [x: number, y: number, z: number],
    startIndex: number,
  ) {
    const isLeaf = voxels.XYZI.length === 1;
    let childIndices = [-1, -1, -1, -1, -1, -1, -1, -1];
    if (isLeaf) {
      this.nodes[startIndex] = {
        childIndices,
        voxels,
        origin,
      };
      return;
    }
    const childVoxels = voxels.XYZI.filter((voxel) => {
      return (
        voxel.x >= origin[0] &&
        voxel.x < origin[0] + voxels.SIZE[0] / 2 &&
        voxel.y >= origin[1] &&
        voxel.y < origin[1] + voxels.SIZE[1] / 2 &&
        voxel.z >= origin[2] &&
        voxel.z < origin[2] + voxels.SIZE[2] / 2
      );
    });
    if (childVoxels.length === 0) {
      this.nodes[startIndex] = {
        childIndices,
        voxels,
        origin,
      };
      return;
    }
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const originX = origin[0] + (voxels.SIZE[0] / 2) * x;
          const originY = origin[1] + (voxels.SIZE[1] / 2) * y;
          const originZ = origin[2] + (voxels.SIZE[2] / 2) * z;
          const childVoxels = voxels.XYZI.filter((voxel) => {
            return (
              voxel.x >= originX &&
              voxel.x < originX + voxels.SIZE[0] / 2 &&
              voxel.y >= originY &&
              voxel.y < originY + voxels.SIZE[1] / 2 &&
              voxel.z >= originZ &&
              voxel.z < originZ + voxels.SIZE[2] / 2
            );
          });
          // No voxels in this octant, skip
          if (childVoxels.length === 0) {
            continue;
          }
          childIndices[x + y * 2 + z * 4] = ++this.#childIndex;
          this.#build(
            {
              SIZE: [
                voxels.SIZE[0] / 2,
                voxels.SIZE[1] / 2,
                voxels.SIZE[2] / 2,
              ],
              XYZI: childVoxels,
              RGBA: voxels.RGBA,
              VOX: childVoxels.length,
            },
            [originX, originY, originZ],
            this.#childIndex,
          );
        }
      }
    }
    this.nodes[startIndex] = {
      childIndices,
      voxels,
      origin,
    };
  }
}

/** Iterative stack-based traversal of the octree */
export const traverseOctree = (octree: Octree) => {
  let stack = [0];
  while (stack.length > 0) {
    const nodeIndex = stack.pop()!;
    const node = octree.nodes[nodeIndex];
    if (node.childIndices[0] === -1) {
      // Leaf node
      continue;
    }
    for (let i = 0; i < 8; i++) {
      if (node.childIndices[i] !== -1) {
        stack.push(node.childIndices[i]);
      }
    }
  }
};
