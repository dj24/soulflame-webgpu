import {
  bitmaskToString,
  getOctreeDepthFromVoxelBounds,
  Octree,
} from "./octree";
import { TVoxels } from "../convert-vxm";

describe("get depth", () => {
  test("1x1x1 has depth of 1", () => {
    expect(getOctreeDepthFromVoxelBounds([1, 1, 1])).toBe(0);
  });

  test("2x2x2 has depth of 2", () => {
    expect(getOctreeDepthFromVoxelBounds([2, 2, 2])).toBe(1);
  });

  test("4x4x4 has depth of 3", () => {
    expect(getOctreeDepthFromVoxelBounds([4, 4, 4])).toBe(2);
  });

  test("256x128x64 has depth of 8", () => {
    expect(getOctreeDepthFromVoxelBounds([256, 128, 64])).toBe(8);
  });
});

describe("octree", () => {
  test("1 voxel in 4x4x4", () => {
    const voxels: TVoxels = {
      SIZE: [8, 8, 8],
      XYZI: [
        { x: 0, y: 0, z: 0, c: 0 },
        { x: 7, y: 0, z: 0, c: 0 },
      ],
      RGBA: [],
      VOX: 1,
    };
    const octree = new Octree(voxels);
    //TODO: find out why last node is empty mask
    console.log(
      octree.nodes.map((node, i) => ({
        index: i,
        mask: bitmaskToString(node.childMask),
        size: node.voxels.SIZE[0],
        pointer: node.firstChildIndex,
        voxels: node.voxels.XYZI.length,
      })),
    );

    console.log({ totalSize: octree.totalSize, textureSize: 8 * 8 * 8 });
  });
});
