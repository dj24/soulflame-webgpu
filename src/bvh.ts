import { Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { frameTimeTracker } from "./app";

type BVHNode = {
  rightChildIndex: number;
  leftChildIndex: number;
  leftObjectCount: number;
  rightObjectCount: number;

  leftAABBMin: Vec3;
  leftAABBMax: Vec3;

  rightAABBMin: Vec3;
  rightAABBMax: Vec3;
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

const getMortonCode = (voxelObject: VoxelObject) => {
  const center = voxelObject.worldSpaceCenter;
  const x = center[0];
  const y = center[1];
  const z = center[2];
  return (x & 0x1ff) | ((y & 0x1ff) << 10) | ((z & 0x1ff) << 20);
};

export class BVH {
  nodes: BVHNode[];
  allVoxelObjects: VoxelObject[];

  constructor(voxelObjects: VoxelObject[]) {
    const start = performance.now();
    this.allVoxelObjects = voxelObjects;
    this.nodes = [];
    this.buildBVH(voxelObjects, 0);
    // this.nodes = [
    //   {
    //     leftAABBMin: [0, 0, 0],
    //     leftAABBMax: [0, 0, 0],
    //     leftObjectCount: 0,
    //     rightAABBMin: [-20, 0, -20],
    //     rightAABBMax: [-10, 10, -10],
    //     rightObjectCount: 1,
    //     leftChildIndex: 0,
    //     rightChildIndex: 0,
    //   },
    // ];
    const end = performance.now();
    frameTimeTracker.addSample("create bvh", end - start);
  }

  buildBVH(voxelObjects: VoxelObject[], startIndex: number) {
    voxelObjects.sort((a, b) => getMortonCode(a) - getMortonCode(b));

    const medianIndex = Math.floor(voxelObjects.length / 2);
    const left = voxelObjects.slice(0, medianIndex);
    const right = voxelObjects.slice(medianIndex);

    const leftAABB = getAABB(left);
    const rightAABB = getAABB(right);

    let leftChildIndex = 2 * startIndex + 1;
    let rightChildIndex = 2 * startIndex + 2;

    // Use voxel object index for leaf nodes
    if (left.length === 1) {
      leftChildIndex = this.allVoxelObjects.indexOf(left[0]);
    }
    if (right.length === 1) {
      rightChildIndex = this.allVoxelObjects.indexOf(right[0]);
    }

    this.nodes[startIndex] = {
      leftAABBMin: left.length > 0 ? leftAABB.min : [0, 0, 0],
      leftAABBMax: left.length > 0 ? leftAABB.max : [0, 0, 0],
      leftObjectCount: left.length,
      rightAABBMin: right.length > 0 ? rightAABB.min : [0, 0, 0],
      rightAABBMax: right.length > 0 ? rightAABB.max : [0, 0, 0],
      rightObjectCount: right.length,
      leftChildIndex,
      rightChildIndex,
    };

    if (left.length > 1) {
      this.buildBVH(left, leftChildIndex);
    }
    if (right.length > 1) {
      this.buildBVH(right, rightChildIndex);
    }
  }

  toGPUBuffer(device: GPUDevice) {
    const childIndicesSize = Int32Array.BYTES_PER_ELEMENT * 2;
    const AABBSize = Float32Array.BYTES_PER_ELEMENT * 8 * 2;
    const objectCountSize = Uint32Array.BYTES_PER_ELEMENT * 2;
    let stride = childIndicesSize + AABBSize + objectCountSize;
    stride = ceilToNearestMultipleOf(stride, 16);
    const buffer = device.createBuffer({
      size: this.nodes.length * stride,
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
      bufferView.setUint32(8, node.leftObjectCount, true);
      bufferView.setUint32(12, node.rightObjectCount, true);

      // Write left AABB
      bufferView.setFloat32(16, node.leftAABBMin[0], true); // 16 byte alignment
      bufferView.setFloat32(20, node.leftAABBMin[1], true);
      bufferView.setFloat32(24, node.leftAABBMin[2], true);

      bufferView.setFloat32(32, node.leftAABBMax[0], true); // 16 byte alignment
      bufferView.setFloat32(36, node.leftAABBMax[1], true);
      bufferView.setFloat32(40, node.leftAABBMax[2], true);

      // Write right AABB
      bufferView.setFloat32(48, node.rightAABBMin[0], true); // 16 byte alignment
      bufferView.setFloat32(52, node.rightAABBMin[1], true);
      bufferView.setFloat32(56, node.rightAABBMin[2], true);

      bufferView.setFloat32(64, node.rightAABBMax[0], true); // 16 byte alignment
      bufferView.setFloat32(68, node.rightAABBMax[1], true);
      bufferView.setFloat32(72, node.rightAABBMax[2], true);

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
