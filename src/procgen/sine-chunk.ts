import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { expose } from "comlink";
import { fractalNoise3D, myrng } from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { NoiseCache } from "./noise-cache";
import { VoxelCache } from "./voxel-cache";

export const CHUNK_HEIGHT = 256;

let octree: Octree;
let noiseCaches: NoiseCache[];
let voxelCaches: VoxelCache;
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
  const leafCache = new VoxelCache(
    (x: number, y: number, z: number) =>
      getCachedVoxel(x + position[0], y + position[1], z + position[2], 0),
    size,
  );

  const octreeDepth = Math.log2(Math.max(...size));
  let voxelCaches = [leafCache];
  for (let i = octreeDepth - 1; i >= 0; i--) {
    const sizeAtDepth = Math.ceil(size[0] / Math.pow(2, octreeDepth - i));
    const cache = new VoxelCache(
      (x: number, y: number, z: number) => {
        const xStart = Math.floor(x / 2) * 2;
        const yStart = Math.floor(y / 2) * 2;
        const zStart = Math.floor(z / 2) * 2;
        let red = 0;
        let green = 0;
        let blue = 0;
        let voxelCount = 0;
        let solid = true;
        for (let dx = 0; dx < 2; dx++) {
          for (let dy = 0; dy < 2; dy++) {
            for (let dz = 0; dz < 2; dz++) {
              const child = voxelCaches[0].get([
                xStart + dx,
                yStart + dy,
                zStart + dz,
              ]);
              if (child) {
                red += child.red;
                green += child.green;
                blue += child.blue;
                voxelCount++;
                if (!child.solid) {
                  solid = false;
                }
              }
            }
          }
        }
        if (voxelCount === 0) {
          return null;
        }
        return {
          red: red / voxelCount,
          green: green / voxelCount,
          blue: blue / voxelCount,
          solid,
        };
      },
      [sizeAtDepth, sizeAtDepth, sizeAtDepth],
    );
    voxelCaches.unshift(cache);
  }

  const getVoxel = (x: number, y: number, z: number, depth: number) => {
    return voxelCaches[depth].get([x, y, z]);
  };

  octree = new Octree(getVoxel, () => 1, Math.max(...size), buffer);
  voxelCaches = undefined;
  return octree.totalSizeBytes + OCTREE_STRIDE;
};

const worker = {
  createOctreeAndReturnBytes,
};

export type TerrainWorker = typeof worker;

expose(worker);
