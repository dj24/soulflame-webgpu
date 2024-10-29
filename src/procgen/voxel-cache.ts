import { Vec3 } from "wgpu-matrix";

type GetVoxel = (
  x: number,
  y: number,
  z: number,
) => { red: number; green: number; blue: number } | null;

const convert3DTo1D = (
  size: [number, number, number] | Vec3,
  position: [number, number, number] | Vec3,
) => {
  return (
    position[0] + position[1] * size[0] + position[2] * (size[0] * size[1])
  );
};

type VoxelCacheConstructorArgs =
  | {
      getVoxel: GetVoxel;
      size: [number, number, number];
    }
  | {
      cache: Uint8Array;
      size: [number, number, number];
    };

const STRIDE = 4;

// Created a noise field for a given volume size
export class VoxelCache {
  cache: Uint8Array;
  private readonly size: [number, number, number];
  private readonly getVoxel: GetVoxel;
  boundsMin: Vec3;
  boundsMax: Vec3;

  constructor(args: VoxelCacheConstructorArgs) {
    // If cache is provided, use it
    if ("cache" in args) {
      this.cache = args.cache;
      return;
    }
    // Otherwise, create a new cache from the getVoxel function
    const { getVoxel, size } = args;
    this.size = size;
    this.getVoxel = getVoxel;
    this.cache = new Uint8Array(size[0] * size[1] * size[2] * STRIDE);
    let isSolid = true;
    this.boundsMin = [Infinity, Infinity, Infinity];
    this.boundsMax = [-Infinity, -Infinity, -Infinity];
    for (let x = 0; x < size[0]; x++) {
      for (let y = 0; y < size[1]; y++) {
        for (let z = 0; z < size[2]; z++) {
          const index = convert3DTo1D(size, [x, y, z]);
          const voxel = getVoxel(x, y, z);
          if (voxel === null) {
            isSolid = false;
            continue;
          }
          this.boundsMin = [
            Math.min(this.boundsMin[0], x),
            Math.min(this.boundsMin[1], y),
            Math.min(this.boundsMin[2], z),
          ];
          this.boundsMax = [
            Math.max(this.boundsMax[0], x),
            Math.max(this.boundsMax[1], y),
            Math.max(this.boundsMax[2], z),
          ];

          this.cache[index * STRIDE] = voxel.red;
          this.cache[index * STRIDE + 1] = voxel.green;
          this.cache[index * STRIDE + 2] = voxel.blue;
        }
      }
    }
    if (!isSolid) {
      return;
    }
    for (let x = 0; x < size[0]; x++) {
      for (let y = 0; y < size[1]; y++) {
        for (let z = 0; z < size[2]; z++) {
          const index = convert3DTo1D(size, [x, y, z]);
          this.cache[index * STRIDE + 4] = 1;
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
    solid: boolean;
  } {
    const index = convert3DTo1D(this.size, [x, y, z]);
    const red = this.cache[index * STRIDE];
    const green = this.cache[index * STRIDE + 1];
    const blue = this.cache[index * STRIDE + 2];
    const solid = this.cache[index * STRIDE + 3] === 1;
    if (red === 0 && green === 0 && blue === 0) {
      return null;
    }
    return { red, green, blue, solid };
  }
}
