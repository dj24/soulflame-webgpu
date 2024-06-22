import {
  getChildMask,
  getOctantOriginFromDepthAndIndex,
  getOctantSizeFromDepth,
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

describe("check octant size", () => {
  test("size of octant at depth 0 is 256", () => {
    expect(getOctantSizeFromDepth(0, [256, 128, 256])).toBe(256);
  });

  test("size of octant at depth 1 is 128", () => {
    expect(getOctantSizeFromDepth(1, [256, 128, 256])).toBe(128);
  });

  test("size of octant at depth 2 is 64", () => {
    expect(getOctantSizeFromDepth(2, [256, 128, 256])).toBe(64);
  });
});

describe("check octant origin position", () => {
  test("origin of octant 0 at depth 0 is [0, 0, 0]", () => {
    expect(getOctantOriginFromDepthAndIndex(0, 0, [256, 256, 256])).toEqual([
      0, 0, 0,
    ]);
  });

  describe("depth 1", () => {
    test("origin of octant 1 at depth 1 is [128, 0, 0]", () => {
      expect(getOctantOriginFromDepthAndIndex(1, 1, [256, 256, 256])).toEqual([
        128, 0, 0,
      ]);
    });

    test("origin of octant 2 at depth 1 is [0, 128, 0]", () => {
      expect(getOctantOriginFromDepthAndIndex(1, 2, [256, 256, 256])).toEqual([
        0, 128, 0,
      ]);
    });

    test("origin of octant 3 at depth 1 is [0, 0, 128]", () => {
      expect(getOctantOriginFromDepthAndIndex(1, 3, [256, 256, 256])).toEqual([
        128, 128, 0,
      ]);
    });

    test("origin of octant 4 at depth 1 is [128, 128, 0]", () => {
      expect(getOctantOriginFromDepthAndIndex(1, 4, [256, 256, 256])).toEqual([
        0, 0, 128,
      ]);
    });

    test("origin of octant 5 at depth 1 is [128, 0, 128]", () => {
      expect(getOctantOriginFromDepthAndIndex(1, 5, [256, 256, 256])).toEqual([
        128, 0, 128,
      ]);
    });

    test("origin of octant 6 at depth 1 is [0, 128, 128]", () => {
      expect(getOctantOriginFromDepthAndIndex(1, 6, [256, 256, 256])).toEqual([
        0, 128, 128,
      ]);
    });

    test("origin of octant 7 at depth 1 is [128, 128, 128]", () => {
      expect(getOctantOriginFromDepthAndIndex(1, 7, [256, 256, 256])).toEqual([
        128, 128, 128,
      ]);
    });
  });

  // TODO: account for parent origin
  describe("depth 2", () => {
    test("origin of octant 0 at depth 2 is [0, 0, 0]", () => {
      expect(getOctantOriginFromDepthAndIndex(2, 0, [256, 256, 256])).toEqual([
        0, 0, 0,
      ]);
    });

    test("origin of octant 1 at depth 2 is [64, 0, 0]", () => {
      expect(getOctantOriginFromDepthAndIndex(2, 1, [256, 256, 256])).toEqual([
        64, 0, 0,
      ]);
    });

    test("origin of octant 2 at depth 2 is [0, 64, 0]", () => {
      expect(getOctantOriginFromDepthAndIndex(2, 2, [256, 256, 256])).toEqual([
        0, 64, 0,
      ]);
    });

    test("origin of octant 0 with offset [128, 128, 128] at depth 2 is [128, 128, 128]", () => {
      expect(
        getOctantOriginFromDepthAndIndex(
          2,
          0,
          [256, 256, 256],
          [128, 128, 128],
        ),
      ).toEqual([128, 128, 128]);
    });
  });
});

describe("octree", () => {
  test.todo("1 voxel in 8x8x8");
});

describe("child mask", () => {
  describe("1 voxel in 8x8x8 volume", () => {
    const baseVoxels: TVoxels = {
      SIZE: [8, 8, 8],
      XYZI: [],
      RGBA: [],
      VOX: 1,
    };
    const octantSize = 4;
    test("octant [0,0,0]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 0, y: 0, z: 0, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b10000000);
    });
    test("octant [1,0,0]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 7, y: 0, z: 0, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b01000000);
    });
    test("octant [0,1,0]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 0, y: 7, z: 0, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b00100000);
    });
    test("octant [1,1,0]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 7, y: 7, z: 0, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b00010000);
    });
    test("octant [0,0,1]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 0, y: 0, z: 7, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b00001000);
    });
    test("octant [1,0,1]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 7, y: 0, z: 7, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b00000100);
    });
    test("octant [0,1,1]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 0, y: 7, z: 7, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b00000010);
    });
    test("octant [1,1,1]", () => {
      const voxels: TVoxels = {
        ...baseVoxels,
        XYZI: [{ x: 7, y: 7, z: 7, c: 0 }],
      };
      expect(getChildMask(voxels, octantSize, [0, 0, 0])).toBe(0b00000001);
    });
  });
});
