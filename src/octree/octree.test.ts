import { getOctreeDepthFromVoxelBounds, Octree } from "./octree";
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
  test("1 voxel in 8x8x8", () => {
    const voxels: TVoxels = {
      SIZE: [8, 8, 8],
      XYZI: [{ x: 0, y: 0, z: 0, c: 0 }],
      RGBA: [],
      VOX: 1,
    };
    const octree = new Octree(voxels);
    expect(octree.nodes.length).toBe(1);
  });

  describe("8 voxels along x axis in 8x8x8", () => {
    let octree: Octree;
    beforeEach(() => {
      const voxels: TVoxels = {
        SIZE: [8, 8, 8],
        XYZI: [
          { x: 0, y: 0, z: 0, c: 0 },
          { x: 1, y: 0, z: 0, c: 0 },
          { x: 2, y: 0, z: 0, c: 0 },
          { x: 3, y: 0, z: 0, c: 0 },
          { x: 4, y: 0, z: 0, c: 0 },
          { x: 5, y: 0, z: 0, c: 0 },
          { x: 6, y: 0, z: 0, c: 0 },
          { x: 7, y: 0, z: 0, c: 0 },
        ],
        RGBA: [],
        VOX: 8,
      };
      octree = new Octree(voxels);
    });
    test("has one 8x8x8 node", () => {
      const nodesOfSize8 = octree.nodes.filter((node) => {
        return node.voxels.SIZE[0] === 8;
      });
      expect(nodesOfSize8).toHaveLength(1);
    });
    test("has 2 4x4x4 nodes", () => {
      const nodesOfSize4 = octree.nodes.filter((node) => {
        return node.voxels.SIZE[0] === 4;
      });
      expect(nodesOfSize4).toHaveLength(2);
    });
    test("has 4 2x2x2 nodes", () => {
      const nodesOfSize2 = octree.nodes.filter((node) => {
        return node.voxels.SIZE[0] === 2;
      });
      expect(nodesOfSize2).toHaveLength(4);
    });
    test("has 8 1x1x1 nodes", () => {
      const nodesOfSize1 = octree.nodes.filter((node) => {
        return node.voxels.SIZE[0] === 1;
      });
      expect(nodesOfSize1).toHaveLength(8);
    });
    test("has 15 nodes", () => {
      expect(octree.nodes).toHaveLength(15);
    });
  });
});
