import { vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { indexOf } from "lodash";
import { voxelObjects } from "./create-tavern";
import { frameTimeTracker } from "./app";

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
    } else {
      right.push(voxelObject);
    }
  }
  return { left, right };
};

const getObjectCenterVariance = (voxelObjects: VoxelObject[]) => {
  const centers = voxelObjects.map(
    (voxelObject) => voxelObject.worldSpaceCenter,
  );
  let mean = centers.reduce((acc, center) => {
    return vec3.add(acc, center);
  }, vec3.create());
  mean = vec3.divScalar(mean, centers.length);
  const variance = centers.reduce((acc, center) => {
    return vec3.add(
      acc,
      vec3.mul(vec3.sub(center, mean), vec3.sub(center, mean)),
    );
  }, vec3.create());
  return vec3.divScalar(variance, centers.length);
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
  leafNodes: VoxelObject[];

  constructor(voxelObjects: VoxelObject[]) {
    const start = performance.now();
    this.allVoxelObjects = voxelObjects;
    this.nodes = [];
    this.leafNodes = [];
    this.buildBVH(voxelObjects, 0);
    const end = performance.now();
    frameTimeTracker.addSample("create bvh", end - start);
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

    voxelObjects.sort((a, b) => getMortonCode(a) - getMortonCode(b));

    const medianIndex = Math.floor(voxelObjects.length / 2);
    const left = voxelObjects.slice(0, medianIndex);
    const right = voxelObjects.slice(medianIndex);

    if (left.length > 1) {
      this.buildBVH(left, leftChildIndex);
    } else if (left.length === 1) {
      const AABB = getAABB(left);
      this.nodes[leftChildIndex] = {
        AABBMin: AABB.min,
        AABBMax: AABB.max,
        leftChildIndex: indexOf(this.allVoxelObjects, left[0]),
        rightChildIndex: -1,
        objectCount: 1,
      };
      this.leafNodes.push(left[0]);
    }
    if (right.length > 1) {
      this.buildBVH(right, rightChildIndex);
    } else if (right.length === 1) {
      const AABB = getAABB(right);
      this.nodes[rightChildIndex] = {
        AABBMin: AABB.min,
        AABBMax: AABB.max,
        leftChildIndex: indexOf(this.allVoxelObjects, right[0]),
        rightChildIndex: -1,
        objectCount: 1,
      };
      this.leafNodes.push(right[0]);
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
      bufferView.setUint32(44, node.objectCount, true);
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
