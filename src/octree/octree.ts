import { TVoxels } from "../convert-vxm";
import { Vec3 } from "wgpu-matrix";

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

export const getOctreeDepthFromVoxelBounds = (size: TVoxels["SIZE"]) => {
  return Math.ceil(Math.log2(Math.max(...size)));
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
    let foundVoxels = false;
    let octantIndex = 0;
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          octantIndex++;
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
          if (childVoxels.length > 0) {
            foundVoxels = true;
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
              [origin[0], origin[1], origin[2]],
              this.#childIndex + octantIndex,
            );
          }
        }
      }
    }
    if (!foundVoxels) {
      return;
    }
    /*
     * Increment by 8 to allow us to lookup nodes based on the bitmask
     * 10000000 = 1
     * 01000000 = 2
     * 00100000 = 3
     * 00010000 = 4
     * etc
     */
    this.#childIndex += 8;
  }
}
