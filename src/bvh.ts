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
    const stride = childIndicesSize + AABBSize + objectCountSize;
    const buffer = device.createBuffer({
      size: this.nodes.length * stride,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    for (const node of this.nodes) {
      const childIndices = new Uint8Array([
        node.leftChildIndex,
        node.rightChildIndex,
      ]);
      device.queue.writeBuffer(
        buffer,
        0, // offset
        childIndices.buffer,
        0, // data offset
        childIndicesSize,
      );

      const AABB = new Float32Array([...node.AABBMin, ...node.AABBMax]);
      device.queue.writeBuffer(
        buffer,
        0, // offset
        childIndices.buffer,
        0, // data offset
        childIndicesSize,
      );

      const objectCount = new Uint16Array([node.objectCount]);
    }
  }
}
