import { Vec3 } from "wgpu-matrix";
import { GetVoxel } from "@renderer/octree/octree";

const convert3DTo1D = (
  size: [number, number, number] | Vec3,
  position: [number, number, number] | Vec3,
) => {
  return (
    position[0] + position[1] * size[0] + position[2] * (size[0] * size[1])
  );
};

// Created a noise field for a given volume size
export class VoxelCache {
  private readonly cache: Uint8Array;
  private readonly size: [number, number, number];
  private readonly getVoxel: GetVoxel;

  constructor(getVoxel: GetVoxel, size: [number, number, number]) {
    this.size = size;
    this.getVoxel = getVoxel;
    this.cache = new Uint8Array(size[0] * size[1] * size[2] * 3);
    // for (let x = 0; x < size[0]; x++) {
    //   for (let y = 0; y < size[1]; y++) {
    //     for (let z = 0; z < size[2]; z++) {
    //       const voxel = getVoxel(x, y, z);
    //       if (voxel === null) {
    //         continue;
    //       }
    //       const redIndex = convert3DTo1D(size, [x, y, z]) * 3;
    //       this.cache[redIndex] = voxel.red;
    //       this.cache[redIndex + 1] = voxel.green;
    //       this.cache[redIndex + 2] = voxel.blue;
    //     }
    //   }
    // }
  }

  get buffer() {
    return this.cache.buffer;
  }

  get([x, y, z]: [number, number, number]): {
    red: number;
    green: number;
    blue: number;
  } {
    const index = convert3DTo1D(this.size, [x, y, z]);
    if (index < 0 || index >= this.size[0] * this.size[1] * this.size[2]) {
      throw new Error(`Index out of bounds: ${index}`);
    }
    const redIndex = index * 3;
    return {
      red: this.cache[redIndex],
      green: this.cache[redIndex + 1],
      blue: this.cache[redIndex + 2],
    };
  }
}
