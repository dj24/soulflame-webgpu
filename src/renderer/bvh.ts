import { vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { frameTimeTracker } from "./app";

type BVHNode = {
  rightChildIndex: number;
  leftChildIndex: number;
  objectCount: number;
  AABBMin: Vec3;
  AABBMax: Vec3;
  parentIndex: number;
  siblingIndex: number;
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

const getNodeSAHCost = (voxelObjects: LeafNode[]) => {
  const aaBB = getAABB(voxelObjects);
  const area =
    (aaBB.max[0] - aaBB.min[0]) *
    (aaBB.max[1] - aaBB.min[1]) *
    (aaBB.max[2] - aaBB.min[2]);
  return voxelObjects.length * area;
};

const SAH_WEIGHT = 1;
const BALANCE_WEIGHT = 1;

const splitObjectsBySAH = (voxelObjects: LeafNode[]) => {
  let minCost = Infinity;
  let minIndex = -1;
  const middleIndex = Math.floor(voxelObjects.length / 2);
  for (let i = 1; i < voxelObjects.length; i++) {
    const left = voxelObjects.slice(0, i);
    const right = voxelObjects.slice(i);
    const sahCost = getNodeSAHCost(left) + getNodeSAHCost(right);
    const balanceFactor = Math.abs(i - middleIndex);
    const weightedBalanceFactor = balanceFactor * BALANCE_WEIGHT;
    const weightedSAHCost = sahCost * SAH_WEIGHT;
    const cost = weightedBalanceFactor + weightedSAHCost;
    if (cost < minCost) {
      minCost = cost;
      minIndex = i;
    }
  }
  const left = voxelObjects.slice(0, minIndex);
  const right = voxelObjects.slice(minIndex);
  return { left, right };
};

const stride = ceilToNearestMultipleOf(56, 16);

/**
 * Bounding Volume Hierarchy. Handles construction and GPU serialisation of the BVH.
 */
export class BVH {
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
    this.#build(this.#allLeafNodes, 0, -1, -1);
    this.#writeToGpuBuffer();
  }

  get gpuBuffer() {
    return this.#gpuBuffer;
  }

  update(boundingBoxes: BoundingBox[]) {
    this.#allLeafNodes = boundingBoxes.map((boundingBox, index) => {
      return {
        AABB: boundingBox,
        objectIndex: index,
      };
    });
    this.#childIndex = 0;
    this.#nodes = [];
    this.#build(this.#allLeafNodes, 0, -1, -1);
    this.#writeToGpuBuffer();
  }

  #build(
    leafNodes: LeafNode[],
    startIndex: number,
    parentIndex: number,
    siblingIndex: number,
  ) {
    if (this.#allLeafNodes.length === 0) {
      return;
    }

    const isLeaf = leafNodes.length === 1;
    if (isLeaf) {
      this.#nodes[startIndex] = {
        leftChildIndex: this.#allLeafNodes.indexOf(leafNodes[0]),
        rightChildIndex: -1,
        objectCount: 1,
        AABBMax: leafNodes[0].AABB.max,
        AABBMin: leafNodes[0].AABB.min,
        parentIndex,
        siblingIndex,
      };
      return;
    }
    const AABB = getAABB(leafNodes);
    let leftChildIndex = -1;
    let rightChildIndex = -1;

    const { left, right } = splitObjectsBySAH(leafNodes);

    if (left.length > 0) {
      leftChildIndex = ++this.#childIndex;
      this.#build(left, leftChildIndex, startIndex, rightChildIndex);
    }
    if (right.length > 0) {
      rightChildIndex = ++this.#childIndex;
      this.#build(right, rightChildIndex, startIndex, leftChildIndex);
    }

    this.#nodes[startIndex] = {
      leftChildIndex,
      rightChildIndex,
      objectCount: leafNodes.length,
      AABBMax: AABB.max,
      AABBMin: AABB.min,
      parentIndex,
      siblingIndex,
    };
  }

  #writeToGpuBuffer() {
    this.#gpuBuffer = this.#device.createBuffer({
      size: Math.max(this.#nodes.length, 1) * stride,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false,
      label: "bvh buffer",
    });

    this.#nodes.forEach((node, i) => {
      const bufferOffset = i * stride;
      const arrayBuffer = new ArrayBuffer(stride);
      const bufferView = new DataView(arrayBuffer);

      // Write childIndices
      bufferView.setInt32(0, node.leftChildIndex, true);
      bufferView.setInt32(4, node.rightChildIndex, true);

      // Write objectCount
      bufferView.setUint32(8, node.objectCount, true);

      // Write AABB
      bufferView.setFloat32(16, node.AABBMin[0], true); // 16 byte alignment
      bufferView.setFloat32(20, node.AABBMin[1], true);
      bufferView.setFloat32(24, node.AABBMin[2], true);

      bufferView.setFloat32(32, node.AABBMax[0], true); // 16 byte alignment
      bufferView.setFloat32(36, node.AABBMax[1], true);
      bufferView.setFloat32(40, node.AABBMax[2], true);

      // Parent and sibling indices
      bufferView.setInt32(48, node.parentIndex, true);
      bufferView.setInt32(52, node.siblingIndex, true);

      // Write the entire ArrayBuffer to the GPU buffer
      this.#device.queue.writeBuffer(
        this.#gpuBuffer,
        bufferOffset, // offset
        arrayBuffer,
        0, // data offset
        stride,
      );
    });
    return this.#gpuBuffer;
  }
}
