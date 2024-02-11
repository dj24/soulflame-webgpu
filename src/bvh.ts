import { Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { device } from "./app";
import { voxelObjects } from "./create-tavern";

type BVHNode = {
  leftChildIndex: number;
  rightChildIndex: number;
  AABBMin: Vec3;
  AABBMax: Vec3;
  objectCount: number;
};

const getMidpoint = (voxelObjects: VoxelObject[], axis: number) => {
  const centers = voxelObjects.map(
    (voxelObject) => voxelObject.worldSpaceCenter,
  );
  centers.sort((a, b) => a[axis] - b[axis]);
  return centers[Math.floor(centers.length / 2)][axis];
};

const sortVoxeObjectsByMidpoint = (
  voxelObjects: VoxelObject[],
  axis: number,
) => {
  return voxelObjects.sort(
    (a, b) => a.worldSpaceCenter[axis] - b.worldSpaceCenter[axis],
  );
};

const getLongestAxis = (AABBMin: Vec3, AABBMax: Vec3) => {
  const size = [
    AABBMax[0] - AABBMin[0],
    AABBMax[1] - AABBMin[1],
    AABBMax[2] - AABBMin[2],
  ];
  return size.indexOf(Math.max(...size));
};

const splitVoxelObjects = (
  voxelObjects: VoxelObject[],
  midPoint: number,
  axis: number,
) => {
  const left = [];
  const right = [];
  for (const voxelObject of voxelObjects) {
    if (voxelObject.worldSpaceCenter[axis] < midPoint) {
      left.push(voxelObject);
    } else if (voxelObject.worldSpaceCenter[axis] > midPoint) {
      right.push(voxelObject);
    }
  }
  return { left, right };
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

const getAABB = (voxelObjects: VoxelObject[]) => {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const voxelObject of voxelObjects) {
    // const midPoint = voxelObject.worldSpaceCenter;
    // for (let i = 0; i < 3; i++) {
    //   min[i] = Math.min(min[i], midPoint[i]);
    //   max[i] = Math.max(max[i], midPoint[i]);
    // }
    for (const corner of voxelObject.worldSpaceCorners) {
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
    this.nodes = [];
    this.buildBVH(voxelObjects, 0);
    console.timeEnd("BVH Created in");
  }

  buildBVH(voxelObjects: VoxelObject[], startIndex: number) {
    const AABB = getAABB(voxelObjects);

    const leftChildIndex = 2 * startIndex + 1;
    const rightChildIndex = 2 * startIndex + 2;
    const node = {
      AABBMin: AABB.min,
      AABBMax: AABB.max,
      leftChildIndex,
      rightChildIndex,
      objectCount: voxelObjects.length,
    };
    this.nodes[startIndex] = node;
    const longestAxis = getLongestAxis(node.AABBMin, node.AABBMax);

    voxelObjects = sortVoxeObjectsByMidpoint(voxelObjects, longestAxis);

    // const midPoint = getMidpoint(voxelObjects, longestAxis);

    const medianIndex = Math.floor(voxelObjects.length / 2);
    const midPoint = voxelObjects[medianIndex].worldSpaceCenter[longestAxis];

    const { left, right } = splitVoxelObjects(
      voxelObjects,
      midPoint,
      longestAxis,
    );
    if (left.length > 1) {
      this.buildBVH(left, leftChildIndex);
    } else if (left.length === 1) {
      const AABB = getAABB(left);
      const node = {
        AABBMin: AABB.min,
        AABBMax: AABB.max,
        leftChildIndex: -1,
        rightChildIndex: -1,
        objectCount: 1,
      };
      this.nodes.push(node);
    }
    if (right.length > 1) {
      this.buildBVH(right, rightChildIndex);
    } else if (right.length === 1) {
      const AABB = getAABB(right);
      const node = {
        AABBMin: AABB.min,
        AABBMax: AABB.max,
        leftChildIndex: -1,
        rightChildIndex: -1,
        objectCount: 1,
      };
      this.nodes.push(node);
    }
    if (left.length <= 1 && right.length <= 1) {
      return;
    }
  }

  toGPUBuffer(device: GPUDevice) {
    const childIndicesSize = Int32Array.BYTES_PER_ELEMENT * 2;
    const AABBSize = Float32Array.BYTES_PER_ELEMENT * 8;
    const objectCountSize = Uint32Array.BYTES_PER_ELEMENT;
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
