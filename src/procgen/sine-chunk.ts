import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { expose } from "comlink";
import { fractalNoise3D, myrng } from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { NoiseCache } from "./noise-cache";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";

export const CHUNK_HEIGHT = 128;

let octree: Octree;
let noiseCache: NoiseCache;
const NOISE_FREQUENCY = 0.001;

export const getCachedVoxel = (
  x: number,
  y: number,
  z: number,
  yStart: number,
) => {
  const n = noiseCache.get([x, y, z]);
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
  noiseCache = new NoiseCache(
    (x, y, z) =>
      fractalNoise3D(
        x + position[0],
        y + position[1],
        z + position[2],
        NOISE_FREQUENCY,
        5,
      ),
    size,
  );
  const getVoxel = (x: number, y: number, z: number) => {
    const terrainVoxel = getCachedVoxel(x, y, z, position[1]);
    return terrainVoxel;
  };

  // const gpuDevice = await getGpuDevice();
  // octree = new GPUOctree(
  //   getVoxel,
  //   () => 1,
  //   Math.max(...size),
  //   buffer,
  //   gpuDevice,
  //   noiseCache,
  // );
  octree = new Octree(getVoxel, () => 1, Math.max(...size), buffer);
  noiseCache = undefined;
  return octree.totalSizeBytes + OCTREE_STRIDE;
};

const worker = {
  createOctreeAndReturnBytes,
};

export type TerrainWorker = typeof worker;

expose(worker);
