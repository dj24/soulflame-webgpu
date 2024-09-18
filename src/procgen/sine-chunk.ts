import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { expose } from "comlink";
import { fractalNoise3D, myrng } from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { NoiseCache } from "./noise-cache";
import { VoxelCache } from "./voxel-cache";

export const CHUNK_HEIGHT = 256;

let octree: Octree;
let noiseCache: NoiseCache;
let voxelCache: VoxelCache;
const NOISE_FREQUENCY = 0.001;

export const getCachedVoxel = (
  x: number,
  y: number,
  z: number,
  yStart: number,
) => {
  const n = fractalNoise3D(x, y, z, NOISE_FREQUENCY, 5);
  // 0 at the y top, 1 at the bottom
  const squashFactor = (yStart + y) / CHUNK_HEIGHT;
  const density = easeInOutCubic((n + 1) / 2);
  if (density > squashFactor) {
    return { red: 0, green: 255 - myrng() * 128, blue: 0 };
  }
  return null;
};

export const createOctreeAndReturnBytes = async (
  position: [number, number, number],
  size: [number, number, number],
  buffer: SharedArrayBuffer,
) => {
  voxelCache = new VoxelCache(
    (x: number, y: number, z: number) =>
      getCachedVoxel(x + position[0], y + position[1], z + position[2], 0),
    size,
  );
  const getVoxel = (x: number, y: number, z: number) => {
    return voxelCache.get([x, y, z]);
  };

  octree = new Octree(getVoxel, () => 1, Math.max(...size), buffer);
  voxelCache = undefined;
  return octree.totalSizeBytes + OCTREE_STRIDE;
};

const worker = {
  createOctreeAndReturnBytes,
};

export type TerrainWorker = typeof worker;

expose(worker);
