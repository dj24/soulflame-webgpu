import { Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { device } from "./app";

type BVHNode = {
  leftChildIndex: number;
  rightChildIndex: number;
  AABBMin: Vec3;
  AABBMax: Vec3;
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
    const corners = voxelObject.worldSpaceCorners;
    for (const corner of corners) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], corner[i]);
        max[i] = Math.max(max[i], corner[i]);
      }
    }
  }
  return { min, max };
};

export class BVH {
  nodes: BVHNode[];

  constructor(voxelObjects: VoxelObject[]) {
    console.time("BVH Created in");
    this.buildBVH(voxelObjects);
    console.timeEnd("BVH Created in");
  }

  buildBVH(voxelObjects: VoxelObject[]) {
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
    const childIndicesSize = Uint32Array.BYTES_PER_ELEMENT * 2;
    const AABBSize = Float32Array.BYTES_PER_ELEMENT * 8;
    const objectCountSize = Uint32Array.BYTES_PER_ELEMENT;
    let stride = childIndicesSize + AABBSize + objectCountSize;
    stride = ceilToNearestMultipleOf(stride, 16);
    const buffer = device.createBuffer({
      size: this.nodes.length * stride,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
    });
    this.nodes.forEach((node, i) => {
      const bufferOffset = i * stride;
      const arrayBuffer = new ArrayBuffer(stride);
      const bufferView = new DataView(arrayBuffer);

      // Write childIndices
      bufferView.setUint32(0, node.leftChildIndex);
      bufferView.setUint32(4, node.rightChildIndex);

      // Write AABB
      bufferView.setFloat32(16, node.AABBMin[0], true); // 16 byte alignment
      bufferView.setFloat32(20, node.AABBMin[1], true);
      bufferView.setFloat32(24, node.AABBMin[2], true);

      bufferView.setFloat32(32, node.AABBMax[0], true); // 16 byte alignment
      bufferView.setFloat32(36, node.AABBMax[1], true);
      bufferView.setFloat32(40, node.AABBMax[2], true);

      // Write objectCount
      bufferView.setUint32(44, node.objectCount);
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
