import { vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { frameTimeTracker } from "./app";
import { TVoxels } from "./convert-vxm";

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

const stride = ceilToNearestMultipleOf(44, 16);

type OctreeNode = {
  childIndices: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  objectCount: number;
  origin: Vec3;
  size: number;
};

type LeafNode = {
  origin: Vec3;
  objectCount: 1;
};

/**
 * Handles construction and GPU serialisation of an Octree for a single voxel object.
 */
export class Octree {
  #device: GPUDevice;
  #nodes: OctreeNode[];
  #childIndex: number;
  #gpuBuffer: GPUBuffer;

  constructor(device: GPUDevice, voxels: TVoxels["XYZI"]) {
    this.#device = device;
    this.#childIndex = 0;
    this.#build(voxels, 0);
    // this.#nodes = new Array(voxels.length * 2 - 1);
    // this.#gpuBuffer = device.createBuffer({
    //   size: this.#nodes.length * stride,
    //   usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    //   mappedAtCreation: false,
    //   label: "octree buffer",
    // });
    this.#writeToGpuBuffer();
  }

  get gpuBuffer() {
    return this.#gpuBuffer;
  }

  update(voxels: TVoxels["XYZI"]) {
    throw new Error("Method not implemented.");
  }

  #build(voxels: TVoxels["XYZI"], startIndex: number) {
    throw new Error("Method not implemented.");
  }

  #writeToGpuBuffer() {
    throw new Error("Method not implemented.");
  }
}
