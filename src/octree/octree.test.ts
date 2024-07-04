import {
  getOctreeDepthFromVoxelBounds,
  LeafNode,
  octantPositions,
  octantIndexToOffset,
  Octree,
  getClosestOctantIndex,
  setInternalNode,
  InternalNode,
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
  test("2 voxel in 4x4x4", () => {
    const voxels: TVoxels = {
      SIZE: [8, 8, 8],
      XYZI: [
        { x: 0, y: 0, z: 0, c: 1 },
        { x: 7, y: 0, z: 0, c: 2 },
      ],
      RGBA: [],
      VOX: 1,
    };
    const octree = new Octree(voxels);
    const leafNodes = octree.nodes.filter((node) => {
      return "leafFlag" in node && node.leafFlag === 0;
    }) as LeafNode[];

    expect(leafNodes.length).toBe(2);
    expect(leafNodes[0].paletteIndex).toBe(1);
    expect(leafNodes[1].paletteIndex).toBe(2);
  });

  test("1 voxel in 256x128x64", () => {
    const voxels: TVoxels = {
      SIZE: [256, 128, 64],
      XYZI: [{ x: 128, y: 32, z: 16, c: 16 }],
      RGBA: [],
      VOX: 1,
    };
    const octree = new Octree(voxels);
    const leafNodes = octree.nodes.filter((node) => {
      return "leafFlag" in node && node.leafFlag === 0;
    }) as LeafNode[];

    expect(leafNodes.length).toBe(1);
    expect(leafNodes[0].paletteIndex).toBe(16);
  });

  test("64 random voxels in 256x128x64", () => {
    const randomVoxels = Array.from({ length: 64 }, () => ({
      x: Math.floor(Math.random() * 255),
      y: Math.floor(Math.random() * 127),
      z: Math.floor(Math.random() * 63),
      c: Math.floor(Math.random() * 255),
    }));

    const voxels: TVoxels = {
      SIZE: [256, 128, 64],
      XYZI: randomVoxels,
      RGBA: [],
      VOX: 1,
    };
    const octree = new Octree(voxels);
    const leafNodes = octree.nodes.filter((node) => {
      return "leafFlag" in node && node.leafFlag === 0;
    }) as LeafNode[];

    expect(leafNodes.length).toBe(64);

    randomVoxels.forEach((voxel, i) => {
      expect(
        leafNodes.find((leafNode) => leafNode.paletteIndex === voxel.c),
      ).toBeTruthy();
    });
  });

  test("solid 64x64x64 has only one node", () => {
    let voxels: TVoxels["XYZI"] = [];
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) {
        for (let z = 0; z < 64; z++) {
          voxels.push({ x, y, z, c: 1 });
        }
      }
    }

    const octree = new Octree({
      SIZE: [64, 64, 64],
      XYZI: voxels,
      RGBA: [],
      VOX: 1,
    });
    expect(octree.nodes.length).toBe(1);
    expect("leafFlag" in octree.nodes[0]).toBeTruthy();
  });

  test("64x64x64 with 1 voxel in each corner has 8 leaf nodes", () => {
    const octree = new Octree({
      SIZE: [64, 64, 64],
      XYZI: [
        { x: 0, y: 0, z: 0, c: 1 },
        { x: 63, y: 0, z: 0, c: 1 },
        { x: 0, y: 63, z: 0, c: 1 },
        { x: 63, y: 63, z: 0, c: 1 },
        { x: 0, y: 0, z: 63, c: 1 },
        { x: 63, y: 0, z: 63, c: 1 },
        { x: 0, y: 63, z: 63, c: 1 },
        { x: 63, y: 63, z: 63, c: 1 },
      ],
      RGBA: [],
      VOX: 8,
    });
    const leafNodes = octree.nodes.filter((node) => {
      return "leafFlag" in node && node.leafFlag === 0;
    }) as LeafNode[];
    expect(leafNodes.length).toBe(8);
  });
});

describe("octant index to offset", () => {
  test.each([0, 1, 2, 3, 4, 5, 6, 7])("octantIndexToOffset (%i)", (index) => {
    expect(octantIndexToOffset(index)).toEqual(octantPositions[index]);
  });
});

describe("get closest octant", () => {
  test("position -10,-10,-10 with node center 0.5,0.5,0.5 is closest to octant 0", () => {
    expect(getClosestOctantIndex([-10, -10, -10], [0.5, 0.5, 0.5])).toBe(0);
  });
  test("position 100,100,100 with node center 0.5,0.5,0.5 is closest to octant 7", () => {
    expect(getClosestOctantIndex([100, 100, 100], [0.5, 0.5, 0.5])).toBe(7);
  });
});

test("internal node is set in dataview correctly", () => {
  const dataView = new DataView(new ArrayBuffer(8));
  const internalNode: InternalNode = {
    childMask: 0b11111111,
    firstChildIndex: 27,
    leafMask: 0b11111111,
    isFarBit: false,
    voxels: {
      SIZE: [64, 64, 64],
      XYZI: [{ x: 0, y: 0, z: 0, c: 1 }],
      RGBA: [],
      VOX: 8,
    },
  };
  setInternalNode(dataView, 0, internalNode);
  // Simulate shader unpacking
  const value = dataView.getUint32(0, true);
  const childMask = value & 0xff;
  const firstChildIndex = (value >> 8) & 0xffff;
  const leafMask = (value >> 24) & 0xff;

  expect(childMask).toBe(0b11111111);
  expect(firstChildIndex).toBe(27);
  expect(leafMask).toBe(0b11111111);
});
