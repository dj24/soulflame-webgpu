import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { expose } from "comlink";
import { fractalNoise3D, myrng } from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { NoiseCache } from "./noise-cache";
import { VoxelCache } from "./voxel-cache";
import { vec3 } from "wgpu-matrix";

export const CHUNK_HEIGHT = 256;

let octree: Octree;
let noiseCaches: NoiseCache[];
let voxelCaches: VoxelCache[];
const NOISE_FREQUENCY = 0.001;
const CAVE_FREQUENCY = 0.008;

export const getCachedVoxel = (
  x: number,
  y: number,
  z: number,
  yStart: number,
) => {
  // 0 at the y top, 1 at the bottom
  const squashFactor = (yStart + y) / CHUNK_HEIGHT;

  const caveNoise = fractalNoise3D(x, y, z, CAVE_FREQUENCY, 3);
  const caveDensity = easeInOutCubic((caveNoise + 1) / 2);
  if (caveDensity < squashFactor) {
    return null;
  }

  // const caveAmount = 1 - Math.max(0, caveDensity - squashFactor) * 2;
  const caveAmount = 0;

  const terrainNoise = fractalNoise3D(x, y, z, NOISE_FREQUENCY, 5);

  const density = easeInOutCubic((terrainNoise + 1) / 2);
  if (density > squashFactor) {
    const colour = vec3.lerp(
      [0, 255 - myrng() * 128, 0],
      [72 - myrng() * 16, 48, 42],
      Math.max(0, caveAmount),
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
  const leafCache = new VoxelCache({
    getVoxel: (x, y, z) =>
      getCachedVoxel(x + position[0], y + position[1], z + position[2], 0),
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
  // voxelCaches = undefined;
  return octree.totalSizeBytes + OCTREE_STRIDE;
};

const worker = {
  createOctreeAndReturnBytes,
};

export type TerrainWorker = typeof worker;

expose(worker);
