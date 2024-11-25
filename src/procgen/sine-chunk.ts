import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { expose } from "comlink";
import {
  fractalNoise2D,
  fractalNoise3D,
  myrng,
  ridgedFractalNoise2D,
} from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { NoiseCache, NoiseCache2D } from "./noise-cache";
import { VoxelCache } from "./voxel-cache";
import { vec3 } from "wgpu-matrix";

export const CHUNK_HEIGHT = 64;

let octree: Octree;
let noiseCaches: NoiseCache[];
let voxelCaches: VoxelCache[];
const NOISE_FREQUENCY = 0.001;
const CAVE_FREQUENCY = 0.008;

export const encodeTerrainName = (
  position: [number, number, number],
  size: [number, number, number],
) => {
  return `Terrain(${position[0]},${position[1]},${position[2]})(${size[0]},${size[1]},${size[2]})`;
};

export const getCachedVoxel = (
  x: number,
  y: number,
  z: number,
  yStart: number,
  noiseCache: NoiseCache2D,
) => {
  const terrainNoise = noiseCache.get([x, z]);

  if (y + yStart < terrainNoise * CHUNK_HEIGHT) {
    const colour = vec3.lerp(
      [0, 255 - myrng() * 128, 0],
      [72 - myrng() * 16, 48, 42],
      1 - y / (terrainNoise * CHUNK_HEIGHT),
    );
    return { red: colour[0], green: colour[1], blue: colour[2], solid: true };
  }
  return null;
};

export const createOctreeAndReturnBytes = async (
  position: [number, number, number],
  size: [number, number, number],
  buffer: SharedArrayBuffer,
) => {
  const noiseCache = new NoiseCache2D(
    (x, y) =>
      ridgedFractalNoise2D(
        x + position[0],
        y + position[2],
        NOISE_FREQUENCY,
        5,
      ),
    [size[0], size[2]],
  );

  const leafCache = new VoxelCache({
    getVoxel: (x, y, z) => getCachedVoxel(x, y, z, 0, noiseCache),
    size,
  });

  const octreeDepth = Math.log2(Math.max(...size));

  voxelCaches = [leafCache];
  for (let i = octreeDepth - 1; i >= 0; i--) {
    const sizeAtDepth = Math.ceil(size[0] / Math.pow(2, octreeDepth - i));
    const cache = new VoxelCache({
      getVoxel: (x, y, z) => {
        const xStart = Math.floor(x / 2) * 2;
        const yStart = Math.floor(y / 2) * 2;
        const zStart = Math.floor(z / 2) * 2;
        let red = 0;
        let green = 0;
        let blue = 0;
        let voxelCount = 0;
        let solidCount = 0;
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
                if (child.solid) {
                  solidCount++;
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
          solid: solidCount === 8,
        };
      },
      size: [sizeAtDepth, sizeAtDepth, sizeAtDepth],
    });
    voxelCaches.unshift(cache);
  }

  const getVoxel = (x: number, y: number, z: number, depth: number) => {
    return voxelCaches[depth].get([x, y, z]);
  };

  octree = new Octree(getVoxel, () => 1, Math.max(...size), buffer);

  return {
    bytes: octree.totalSizeBytes,
    boundsMin: leafCache.boundsMin,
    boundsMax: leafCache.boundsMax,
  };
};

const worker = {
  createOctreeAndReturnBytes,
};

export type TerrainWorker = typeof worker;

expose(worker);
