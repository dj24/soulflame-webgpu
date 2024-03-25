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

const splitObjectsBySurfaceAreaHeuristic = (voxelObjects: VoxelObject[]) => {
  let left: VoxelObject[] = [];
  let right: VoxelObject[] = [];
  let bestSplitAxis = 0; // Initialize best split axis
  let bestSplitPosition = 0; // Initialize best split position
  let bestSplitCost = Infinity; // Initialize best split cost

  // Calculate the surface area of the parent AABB
  const parentAABB = getAABB(voxelObjects);
  const parentSurfaceArea = calculateSurfaceArea(
    parentAABB.min,
    parentAABB.max,
  );

  // Iterate over each axis (X, Y, Z)
  for (let axis = 0; axis < 3; axis++) {
    // Sort the objects along the current axis
    const sortedAlongAxis = voxelObjects.sort((a, b) => {
      return a.worldSpaceCenter[axis] - b.worldSpaceCenter[axis];
    });

    // Iterate over potential split positions
    for (let i = 1; i < sortedAlongAxis.length; i++) {
      // Split the objects into left and right sets
      const leftSet = sortedAlongAxis.slice(0, i);
      const rightSet = sortedAlongAxis.slice(i);

      // Calculate the surface area of the AABBs for the left and right sets
      const leftAABB = getAABB(leftSet);
      const rightAABB = getAABB(rightSet);

      // Calculate the surface areas of the left and right AABBs
      const leftSurfaceArea = calculateSurfaceArea(leftAABB.min, leftAABB.max);
      const rightSurfaceArea = calculateSurfaceArea(
        rightAABB.min,
        rightAABB.max,
      );

      // Calculate the SAH cost for this split
      const splitCost =
        (leftSurfaceArea / parentSurfaceArea) * leftSet.length +
        (rightSurfaceArea / parentSurfaceArea) * rightSet.length;

      // Update the best split if this split has lower cost
      if (splitCost < bestSplitCost) {
        bestSplitAxis = axis;
        bestSplitPosition =
          sortedAlongAxis[i - 1].worldSpaceCenter[axis] +
          sortedAlongAxis[i].worldSpaceCenter[axis] / 2;
        bestSplitCost = splitCost;
        left = leftSet;
        right = rightSet;
      }
    }
  }
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

    const { left, right } = splitObjectsByMortonCode(voxelObjects);
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
