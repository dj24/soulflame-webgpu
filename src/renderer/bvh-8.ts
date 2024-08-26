import { vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { frameTimeTracker } from "./app";

type BVHNode = {
  firstChildRelativeIndex: number;
  AABBMin: Vec3;
  AABBMax: Vec3;
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

export type BoundingBox = { min: Vec3; max: Vec3 };

type LeafNode = {
  AABB: BoundingBox;
  objectIndex: number;
};

const getAABB = (voxelObjects: LeafNode[]) => {
  let min = vec3.create(Infinity, Infinity, Infinity);
  let max = vec3.create(-Infinity, -Infinity, -Infinity);
  for (const { AABB } of voxelObjects) {
    min = vec3.min(AABB.min, min);
    max = vec3.max(AABB.max, max);
  }
  return { min, max };
};

// Splits the objects into 8 octants
const splitOctants = (voxelObjects: LeafNode[]) => {};

const stride = ceilToNearestMultipleOf(44, 16);

/**
 * Bounding Volume Hierarchy. Handles construction and GPU serialisation of the BVH.
 */
export class BVH8 {
  #device: GPUDevice;
  #nodes: BVHNode[];
  #allLeafNodes: LeafNode[];
  #childIndex: number;
  #gpuBuffer: GPUBuffer;

  constructor(device: GPUDevice, boundingBoxes: BoundingBox[]) {
    this.#device = device;
    this.#allLeafNodes = boundingBoxes.map((boundingBox, index) => {
      return {
        AABB: boundingBox,
        objectIndex: index,
      };
    });
    this.#childIndex = 0;
    this.#nodes = [];
    this.#build(this.#allLeafNodes, 0);
    console.log(this.#nodes);
  }

  #build(leafNodes: LeafNode[], startIndex: number) {
    if (this.#allLeafNodes.length === 0) {
      return;
    }

    const AABB = getAABB(leafNodes);
  }
}
