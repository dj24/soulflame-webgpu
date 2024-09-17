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

const STRIDE = 4;

// Created a noise field for a given volume size
export class VoxelCache {
  private readonly cache: Uint8Array;
  private readonly size: [number, number, number];
  private readonly getVoxel: GetVoxel;

  constructor(getVoxel: GetVoxel, size: [number, number, number]) {
    this.size = size;
    this.getVoxel = getVoxel;
    this.cache = new Uint8Array(size[0] * size[1] * size[2] * STRIDE);
    for (let x = 0; x < size[0]; x++) {
      for (let y = 0; y < size[1]; y++) {
        for (let z = 0; z < size[2]; z++) {
          const index = convert3DTo1D(size, [x, y, z]);
          const voxel = getVoxel(x, y, z);
          if (voxel === null) {
            continue;
          }
          this.cache[index * STRIDE] = voxel.red;
          this.cache[index * STRIDE + 1] = voxel.green;
          this.cache[index * STRIDE + 2] = voxel.blue;
        }
      }
    }
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
    const red = this.cache[index * STRIDE];
    const green = this.cache[index * STRIDE + 1];
    const blue = this.cache[index * STRIDE + 2];
    if (red === 0 && green === 0 && blue === 0) {
      return null;
    }
    return { red, green, blue };
  }
}
