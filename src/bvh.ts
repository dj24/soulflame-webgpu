import { Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { frameTimeTracker } from "./app";

type BVHNode = {
  rightChildIndex: number;
  leftChildIndex: number;
  objectCount: number;
  AABBMin: Vec3;
  AABBMax: Vec3;
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

const getAABB = (voxelObjects: VoxelObject[]) => {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const voxelObject of voxelObjects) {
    for (const corner of voxelObject.worldSpaceCorners) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], corner[i]);
        max[i] = Math.max(max[i], corner[i]);
      }
    }
  }
  return { min, max };
};

const splitObjectsBySize = (voxelObjects: VoxelObject[]) => {
  voxelObjects.sort((a, b) => {
    const aSize = a.size[0] * a.size[1] * a.size[2];
    const bSize = b.size[0] * b.size[1] * b.size[2];
    return aSize - bSize;
  });

  const medianIndex = Math.floor(voxelObjects.length / 2);
  const left = voxelObjects.slice(0, medianIndex);
  const right = voxelObjects.slice(medianIndex);

  return { left, right };
};

let timeSpentSplitting = 0;
let splitCalls = 0;
const splitObjectsBySAH = (voxelObjects: VoxelObject[]) => {
  let minCost = Infinity;
  let minIndex = -1;

  const start = performance.now();
  for (let i = 1; i < voxelObjects.length; i++) {
    const left = voxelObjects.slice(0, i);
    const right = voxelObjects.slice(i);
    const leftAABB = getAABB(left);
    const rightAABB = getAABB(right);
    const leftArea =
      (leftAABB.max[0] - leftAABB.min[0]) *
      (leftAABB.max[1] - leftAABB.min[1]) *
      (leftAABB.max[2] - leftAABB.min[2]);
    const rightArea =
      (rightAABB.max[0] - rightAABB.min[0]) *
      (rightAABB.max[1] - rightAABB.min[1]) *
      (rightAABB.max[2] - rightAABB.min[2]);
    const cost = left.length * leftArea + right.length * rightArea;

    if (cost < minCost) {
      minCost = cost;
      minIndex = i;
    }
  }

  const left = voxelObjects.slice(0, minIndex);
  const right = voxelObjects.slice(minIndex);

  const end = performance.now();
  timeSpentSplitting += end - start;
  splitCalls++;
  return { left, right };
};

// TODO: use compute shader to build BVH
export class BVH {
  nodes: BVHNode[];
  allVoxelObjects: VoxelObject[];

  constructor(voxelObjects: VoxelObject[]) {
    const start = performance.now();
    this.allVoxelObjects = voxelObjects;
    this.nodes = [];
    this.buildBVH(voxelObjects, 0);
    const end = performance.now();
    frameTimeTracker.addSample("create bvh", end - start);
  }

  buildBVH(voxelObjects: VoxelObject[], startIndex: number) {
    if (voxelObjects.length === 0) {
      return;
    }

    const AABB = getAABB(voxelObjects);

    // Use voxel object index for leaf nodes
    if (voxelObjects.length === 1) {
      this.nodes[startIndex] = {
        leftChildIndex: this.allVoxelObjects.indexOf(voxelObjects[0]),
        rightChildIndex: -1,
        objectCount: voxelObjects.length,
        AABBMax: AABB.max,
        AABBMin: AABB.min,
      };
      return;
    }

    const { left, right } = splitObjectsBySAH(voxelObjects);
    let leftChildIndex = 2 * startIndex + 1;
    let rightChildIndex = 2 * startIndex + 2;

    this.nodes[startIndex] = {
      leftChildIndex,
      rightChildIndex,
      objectCount: voxelObjects.length,
      AABBMax: AABB.max,
      AABBMin: AABB.min,
    };

    if (left.length > 0) {
      this.buildBVH(left, leftChildIndex);
    }
    if (right.length > 0) {
      this.buildBVH(right, rightChildIndex);
    }
  }

  // TODO: implement this
  compressBVH() {}

  toGPUBuffer(device: GPUDevice, length: number) {
    const stride = ceilToNearestMultipleOf(44, 16);
    const buffer = device.createBuffer({
      size: length * stride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
    });
    this.nodes.forEach((node, i) => {
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

      // Write the entire ArrayBuffer to the GPU buffer
      device.queue.writeBuffer(
        buffer,
        bufferOffset, // offset
        arrayBuffer,
        0, // data offset
        stride,
      );
    });
    return buffer;
  }
}
