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

const getMortonCode = (voxelObject: VoxelObject) => {
  const center = voxelObject.worldSpaceCenter;
  const x = center[0];
  const y = center[1];
  const z = center[2];
  return (x & 0x1ff) | ((y & 0x1ff) << 10) | ((z & 0x1ff) << 20);
};

const calculateSurfaceArea = (min: Vec3, max: Vec3) => {
  const width = max[0] - min[0];
  const height = max[1] - min[1];
  const depth = max[2] - min[2];
  return 2 * (width * height + width * depth + height * depth);
};

const splitObjectsByMortonCode = (voxelObjects: VoxelObject[]) => {
  voxelObjects.sort((a, b) => getMortonCode(a) - getMortonCode(b));

  const medianIndex = Math.floor(voxelObjects.length / 2);
  const left = voxelObjects.slice(0, medianIndex);
  const right = voxelObjects.slice(medianIndex);

  return { left, right };
};

const getVoxelObjectMinAndMax = (voxelObject: VoxelObject) => {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const corner of voxelObject.worldSpaceCorners) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], corner[i]);
      max[i] = Math.max(max[i], corner[i]);
    }
  }
  return { min, max };
};

const splitObjectsBySurfaceArea = (voxelObjects: VoxelObject[]) => {
  voxelObjects.sort((a, b) => {
    const aMinMax = getVoxelObjectMinAndMax(a);
    const bMinMax = getVoxelObjectMinAndMax(b);
    return (
      calculateSurfaceArea(aMinMax.min, aMinMax.max) -
      calculateSurfaceArea(bMinMax.min, bMinMax.max)
    );
  });

  const medianIndex = Math.floor(voxelObjects.length / 2);
  const left = voxelObjects.slice(0, medianIndex);
  const right = voxelObjects.slice(medianIndex);

  return { left, right };
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

    const leafNodes = this.nodes.filter((node) => node.objectCount === 1);

    console.log({
      leafCount: leafNodes.length,
      voxelObjectCount: voxelObjects.length,
    });
  }

  buildBVH(voxelObjects: VoxelObject[], startIndex: number) {
    if (voxelObjects.length === 0) {
      return;
    }

    const { left, right } = splitObjectsBySize(voxelObjects);
    const AABB = getAABB(voxelObjects);
    let leftChildIndex = 2 * startIndex + 1;
    let rightChildIndex = 2 * startIndex + 2;

    // Use voxel object index for leaf nodes
    if (voxelObjects.length === 1) {
      leftChildIndex = this.allVoxelObjects.indexOf(voxelObjects[0]);
      rightChildIndex = -1;
    }

    this.nodes[startIndex] = {
      leftChildIndex,
      rightChildIndex,
      objectCount: voxelObjects.length,
      AABBMax: AABB.max,
      AABBMin: AABB.min,
    };

    if (left.length > 1) {
      this.buildBVH(left, leftChildIndex);
    }
    if (right.length > 1) {
      this.buildBVH(right, rightChildIndex);
    }
    if (voxelObjects.length === 2) {
      this.buildBVH(left, leftChildIndex);
      this.buildBVH(right, rightChildIndex);
    }
  }

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
