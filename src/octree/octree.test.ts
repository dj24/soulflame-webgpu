import { InternalNode, LeafNode, Octree } from "./octree";
import { TVoxels } from "../convert-vxm";

test("octree is built in a way to make sure a child node is no more than 255 indices away from its parent", () => {
  const XYZI = new Array(4096).fill(0).map((_, i) => ({
    x: i % 16,
    y: Math.floor(i / 16),
    z: 0,
    c: 0,
  }));

  const voxels: TVoxels = {
    SIZE: [8, 8, 8],
    XYZI,
    RGBA: [{ r: 0, g: 0, b: 0, a: 0 }],
    VOX: XYZI.length,
  };
  const octree = new Octree(voxels);
  const nodeWithFirstChildIndexGreaterThan255 = octree.nodes.find(
    (node) => node && "firstChildIndex" in node && node.firstChildIndex > 255,
  ) as InternalNode;
  expect(nodeWithFirstChildIndexGreaterThan255).toBe(undefined);
});

test("node colours are grabbed correctly from the pallete", () => {
  const voxels: TVoxels = {
    SIZE: [8, 8, 8],
    XYZI: [
      { x: 0, y: 0, z: 0, c: 1 },
      { x: 7, y: 0, z: 0, c: 1 },
    ],
    RGBA: [
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 255, g: 128, b: 64, a: 255 },
    ],
    VOX: 2,
  };
  const octree = new Octree(voxels);
  const firstLeafNode = octree.nodes.find(
    (node) => "leafFlag" in node && node.leafFlag === 0,
  ) as LeafNode;
  expect(firstLeafNode.red).toBe(255);
  expect(firstLeafNode.green).toBe(128);
  expect(firstLeafNode.blue).toBe(64);
});

test("can follow from root to leaf node", () => {
  const XYZI = new Array(4096).fill(0).map((_, i) => ({
    x: i % 16,
    y: Math.floor(i / 16),
    z: 0,
    c: 0,
  }));
  const voxels: TVoxels = {
    SIZE: [16, 16, 16],
    XYZI,
    RGBA: [{ r: 0, g: 0, b: 0, a: 0 }],
    VOX: XYZI.length,
  };
  const octree = new Octree(voxels);
  let node = octree.nodes[0];
  while (node && "firstChildIndex" in node) {
    const relativeIndex = node.firstChildIndex;
    const indexOfCurrentNode = octree.nodes.indexOf(node);
    node = octree.nodes[indexOfCurrentNode + relativeIndex];
    console.log(node);
  }
  expect("leafFlag" in node).toBe(true);
});

test("following to child node has half the size of the parent node", () => {
  const XYZI = new Array(4096).fill(0).map((_, i) => ({
    x: i % 16,
    y: Math.floor(i / 16),
    z: 0,
    c: 0,
  }));
  const voxels: TVoxels = {
    SIZE: [16, 16, 16],
    XYZI,
    RGBA: [{ r: 0, g: 0, b: 0, a: 0 }],
    VOX: XYZI.length,
  };
  const octree = new Octree(voxels);
  let node = octree.nodes[0] as InternalNode;
  const childIndex = (node as InternalNode).firstChildIndex;
  const childNode = octree.nodes[childIndex] as InternalNode;
  expect(childNode).toBeDefined();
  expect(childNode).toHaveProperty("size");
  expect(childNode.size).toBe(node.size / 2);

  const grandChildIndex =
    octree.nodes.indexOf(childNode) + childNode.firstChildIndex;
  const grandChildNode = octree.nodes[grandChildIndex] as InternalNode;
  expect(grandChildNode).toBeDefined();
  expect(grandChildNode).toHaveProperty("size");
  expect(grandChildNode.size).toBe(childNode.size / 2);
});
