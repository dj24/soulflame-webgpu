import { Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { device } from "./app";

type BVHNode = {
  AABBMin: Vec3;
  AABBMax: Vec3;
  leftChildIndex: number;
  rightChildIndex: number;
  objectCount: number;
};

const getMedian = (voxelObjects: VoxelObject[], axis: 0 | 1 | 2) => {
  const centers = voxelObjects.map(
    (voxelObject) => voxelObject.worldSpaceCenter,
  );
  centers.sort((a, b) => a[axis] - b[axis]);
  return centers[Math.floor(centers.length / 2)][axis];
};

const getAABBCentroid = (AABBMin: Vec3, AABBMax: Vec3) => {
  return [
    (AABBMin[0] + AABBMax[0]) / 2,
    (AABBMin[1] + AABBMax[1]) / 2,
    (AABBMin[2] + AABBMax[2]) / 2,
  ];
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

const getAABB = (voxelObjects: VoxelObject[]) => {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const voxelObject of voxelObjects) {
    // TODO: use corners to more accurately calculate AABB
    const center = voxelObject.worldSpaceCenter;
    const size = voxelObject.size;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], center[i] - size[i] / 2);
      max[i] = Math.max(max[i], center[i] + size[i] / 2);
    }
  }
  return { min, max };
};

export class BVH {
  nodes: BVHNode[];

  constructor(voxelObjects: VoxelObject[]) {
    this.nodes = [
      {
        AABBMin: getAABB(voxelObjects).min,
        AABBMax: getAABB(voxelObjects).max,
        leftChildIndex: 0,
        rightChildIndex: 0,
        objectCount: voxelObjects.length,
      },
    ];
  }

  toGPUBuffer(device: GPUDevice) {
    const childIndicesSize = Uint8Array.BYTES_PER_ELEMENT * 2;
    const AABBSize = Float32Array.BYTES_PER_ELEMENT * 6;
    const objectCountSize = Uint16Array.BYTES_PER_ELEMENT;
    let stride = childIndicesSize + AABBSize + objectCountSize;
    stride = ceilToNearestMultipleOf(stride, 16);
    console.log("stride", stride);
    const buffer = device.createBuffer({
      size: this.nodes.length * stride,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const bufferOffset = i * stride;
      const childIndices = new Uint8Array([
        node.leftChildIndex,
        node.rightChildIndex,
      ]);
      device.queue.writeBuffer(
        buffer,
        bufferOffset, // offset
        childIndices.buffer,
        0, // data offset
        childIndicesSize,
      );

      const AABB = new Float32Array([...node.AABBMin, ...node.AABBMax]);
      device.queue.writeBuffer(
        buffer,
        bufferOffset, // offset
        AABB.buffer,
        childIndicesSize, // data offset
        AABBSize,
      );

      const objectCount = new Uint16Array([node.objectCount]);
      device.queue.writeBuffer(
        buffer,
        bufferOffset, // offset
        objectCount.buffer,
        childIndicesSize + AABBSize, // data offset
        objectCountSize,
      );
      return buffer;
    }
  }
}
