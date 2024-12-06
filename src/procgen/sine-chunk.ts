import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { expose } from "comlink";
import {
  fractalNoise2D,
  fractalNoise3D,
  myrng,
  ridgedFractalNoise2D,
} from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { convert3DTo1D, NoiseCache, NoiseCache2D } from "./noise-cache";
import { VoxelCache } from "./voxel-cache";
import { vec2, Vec2, Vec3, vec3 } from "wgpu-matrix";
import { convertVxm } from "@renderer/convert-vxm";

export const CHUNK_HEIGHT = 128;

let octree: Octree;
let noiseCaches: NoiseCache[];
let voxelCaches: VoxelCache[];
const NOISE_FREQUENCY = 0.0003;
const CAVE_FREQUENCY = 0.008;

export const encodeTerrainName = (
  position: [number, number, number],
  size: [number, number, number],
) => {
  return `Terrain(${position[0]},${position[1]},${position[2]})(${size[0]},${size[1]},${size[2]})`;
};

const getTreeCache = async () => {
  const path = "./xmas-game-jam-2024/tree1.vxm";
  const response = await fetch(path);
  const arrayBuffer = await response.arrayBuffer();
  const voxels = convertVxm(arrayBuffer);
  const cache = new Uint8Array(
    voxels.SIZE[0] * voxels.SIZE[1] * voxels.SIZE[2] * 3,
  );
  voxels.XYZI.forEach((voxel) => {
    const index = convert3DTo1D(voxels.SIZE, [voxel.x, voxel.y, voxel.z]);
    cache[index * 3] = voxels.RGBA[voxel.c].r;
    cache[index * 3 + 1] = voxels.RGBA[voxel.c].g;
    cache[index * 3 + 2] = voxels.RGBA[voxel.c].b;
  });
  return (x: number, y: number, z: number) => {
    const index = convert3DTo1D(voxels.SIZE, [x, y, z]);
    const red = cache[index * 3];
    const green = cache[index * 3 + 1];
    const blue = cache[index * 3 + 2];
    if (red === 0 && green === 0 && blue === 0) {
      return null;
    }
    if (x >= voxels.SIZE[0] || y >= voxels.SIZE[1] || z >= voxels.SIZE[2]) {
      return null;
    }
    return {
      red: cache[index * 3],
      green: cache[index * 3 + 1],
      blue: cache[index * 3 + 2],
      solid: true,
    };
  };
};

const sdCone = (p: Vec3, sinCosAngle: Vec2, height: number) => {
  const q = vec2.length(vec2.create(p[0], p[2]));
  const dot = vec2.dot(sinCosAngle, vec2.create(q, p[1]));
  return Math.max(dot, -height - p[1]);
};

const getSdfTreeCache = async () => {
  return (x: number, y: number, z: number) => {
    const p = [x, y, z];
    const angleRadians = 2 * 3.1423 * 270;
    const sinCosAngle = vec2.create(
      Math.sin(angleRadians),
      Math.cos(angleRadians),
    );
    if (sdCone(p, sinCosAngle, 32) <= 0) {
      return {
        red: 0,
        green: 255,
        blue: 0,
        solid: true,
      };
    }
    return null;
  };
};

export const getTerrainVoxel = (
  x: number,
  y: number,
  z: number,
  yStart: number,
  noiseCache: NoiseCache2D,
) => {
  const terrainNoise = noiseCache.get([x, z]);
  let offsetY = y + yStart;
  if (offsetY < terrainNoise * CHUNK_HEIGHT) {
    const colour = vec3.lerp(
      [0, 128 - myrng() * 32, 0],
      [72 - myrng() * 8, 48, 42],
      0,
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
        7,
      ),
    [size[0], size[2]],
  );

  const getTreeVoxel = await getSdfTreeCache();

  const treeRepeatX = 128;
  const treeRepeatZ = 128;

  const leafCache = new VoxelCache({
    getVoxel: (x, y, z) => {
      const terrainVoxel = getTerrainVoxel(x, y, z, position[1], noiseCache);
      if (!terrainVoxel) {
        const terrainNoise = noiseCache.get([x, z]);
        const terrainHeight = terrainNoise * CHUNK_HEIGHT;
        return getTreeVoxel(x % treeRepeatX, y - 128, z % treeRepeatZ);
      }
      return terrainVoxel;
    },
    size,
  });

  const octreeDepth = Math.log2(Math.max(...size));

  voxelCaches = [leafCache];

  for (let i = octreeDepth - 1; i >= 0; i--) {
    console.time("createOctreeAndReturnBytes " + i);
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
    console.timeEnd("createOctreeAndReturnBytes " + i);
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
