import { vec3, Vec3 } from "wgpu-matrix";
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

type AABB = { min: Vec3; max: Vec3 };

const getAABB = (voxelObjects: AABB[]) => {
  let min = vec3.create(Infinity, Infinity, Infinity);
  let max = vec3.create(-Infinity, -Infinity, -Infinity);
  for (const AABB of voxelObjects) {
    min = vec3.min(AABB.min, min);
    max = vec3.max(AABB.max, max);
  }
  return { min, max };
};

const getNodeSAHCost = (voxelObjects: AABB[]) => {
  console.time(`getAABB ${voxelObjects.length} objects`);
  const aaBB = getAABB(voxelObjects);
  console.timeEnd(`getAABB ${voxelObjects.length} objects`);
  const area =
    (aaBB.max[0] - aaBB.min[0]) *
    (aaBB.max[1] - aaBB.min[1]) *
    (aaBB.max[2] - aaBB.min[2]);
  return voxelObjects.length * area;
};

const SAH_WEIGHT = 1;
const BALANCE_WEIGHT = 1000;

const splitObjectsBySAH = (voxelObjects: AABB[]) => {
  let minCost = Infinity;
  let minIndex = -1;
  const middleIndex = Math.floor(voxelObjects.length / 2);
  console.time(`split ${voxelObjects.length} objects`);
  for (let i = 1; i < voxelObjects.length; i++) {
    const left = voxelObjects.slice(0, i);
    const right = voxelObjects.slice(i);

    const sahCost = getNodeSAHCost(left) + getNodeSAHCost(right);
    const balanceFactor = Math.abs(i - middleIndex);

    const weightedBalanceFactor = balanceFactor * BALANCE_WEIGHT;
    const weightedSAHCost = sahCost * SAH_WEIGHT;

    console.debug({
      sahCost,
      balanceFactor,
      weightedBalanceFactor,
      weightedSAHCost,
    });

    const cost = weightedBalanceFactor + weightedSAHCost;

    if (cost < minCost) {
      minCost = cost;
      minIndex = i;
    }
  }
  const left = voxelObjects.slice(0, minIndex);
  const right = voxelObjects.slice(minIndex);
  console.timeEnd(`split ${voxelObjects.length} objects`);
  return { left, right };
};

const splitObjectsBySAHCompute = async (
  device: GPUDevice,
  voxelObjects: VoxelObject[],
) => {
  const commandEncoder = device.createCommandEncoder();
  const voxelObjectsBuffer = device.createBuffer({
    size: voxelObjects.length * 512,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE,
  });
  // Stores the index of the voxel object to split on
  const outputBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        struct AABB {
          vec3 min;
          vec3 max;
        };
        @group(0) @binding(1) var<storage> cornersBuffer: array<AABB>;
        @group(0) @binding(2) var<storage, read_write> splitIndex: <atomic<u32>>;
        
        @compute @workgroup_size(64, 1, 1)
         fn main(
           @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
         ) {
            
         }
        `,
      }),
      entryPoint: "main",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 1,
        resource: {
          buffer: voxelObjectsBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: outputBuffer,
        },
      },
    ],
  });

  const passEncoder = commandEncoder.beginComputePass();

  const workGroupSizeX = 64;
  const possibleSplitCount = voxelObjects.length;
};

export const createBVH = (
  device: GPUDevice,
  voxelObjects: VoxelObject[],
): GPUBuffer => {
  let nodes: BVHNode[] = [];
  const voxelObjectAABBs: AABB[] = voxelObjects
    .map(({ brickAABBs }) => {
      return brickAABBs;
    })
    .flat();
  let childIndex = 0;
  const build = (voxelObjects: AABB[], startIndex: number) => {
    console.time(`build ${voxelObjects.length} objects at ${startIndex}`);
    if (voxelObjects.length === 0) {
      return;
    }
    const AABB = getAABB(voxelObjects);
    const isLeaf = voxelObjects.length === 1;
    if (isLeaf) {
      nodes[startIndex] = {
        leftChildIndex: voxelObjectAABBs.indexOf(voxelObjects[0]),
        rightChildIndex: -1,
        objectCount: voxelObjects.length,
        AABBMax: AABB.max,
        AABBMin: AABB.min,
      };
      console.timeEnd(`build ${voxelObjects.length} objects at ${startIndex}`);
      return;
    }

    let leftChildIndex = -1;
    let rightChildIndex = -1;

    const { left, right } = splitObjectsBySAH(voxelObjects);

    if (left.length > 0) {
      leftChildIndex = ++childIndex;
      build(left, leftChildIndex);
    }
    if (right.length > 0) {
      rightChildIndex = ++childIndex;
      build(right, rightChildIndex);
    }

    nodes[startIndex] = {
      leftChildIndex,
      rightChildIndex,
      objectCount: voxelObjects.length,
      AABBMax: AABB.max,
      AABBMin: AABB.min,
    };

    console.timeEnd(`build ${voxelObjects.length} objects at ${startIndex}`);
  };

  const toGPUBuffer = (device: GPUDevice, length: number) => {
    const stride = ceilToNearestMultipleOf(44, 16);
    const buffer = device.createBuffer({
      size: length * stride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
    });
    nodes.forEach((node, i) => {
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
  };

  const start = performance.now();
  build(voxelObjectAABBs, 0);
  const end = performance.now();
  frameTimeTracker.addSample("create bvh", end - start);

  console.log({ nodes });

  return toGPUBuffer(device, nodes.length);
};
