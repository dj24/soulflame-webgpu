import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { expose } from "comlink";
import {
  fractalNoise2D,
  fractalNoise3D,
  myrng,
  ridgedFractalNoise2D,
  ridgedFractalNoise3D,
} from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { convert3DTo1D, NoiseCache, NoiseCache2D } from "./noise-cache";
import { VoxelCache } from "./voxel-cache";
import { vec2, Vec2, Vec3, vec3 } from "wgpu-matrix";
import { convertVxm } from "@renderer/convert-vxm";

export const CHUNK_HEIGHT = 128;

let octree: Octree;
let voxelCaches: VoxelCache[];
const NOISE_FREQUENCY = 0.0003;

export const encodeTerrainName = (
  position: [number, number, number],
  size: [number, number, number],
) => {
  return `Terrain(${position[0]},${position[1]},${position[2]})(${size[0]},${size[1]},${size[2]})`;
};

const getCabinCache = async () => {
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

  const getVoxel = (x: number, y: number, z: number) => {
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

  return getVoxel;
};

const sdCone = (p: Vec3, sinCosAngle: Vec2, height: number) => {
  const q = vec2.length(vec2.create(p[0], p[2]));
  const dot = vec2.dot(sinCosAngle, vec2.create(q, p[1]));
  return Math.max(dot, -height - p[1]);
};

const getSdfTreeCache = async () => {
  const circumference = 64;
  const maxConeSize = 10;
  const height = 64;
  const width = circumference;
  const depth = circumference;

  const cache = new Uint8Array(width * width * depth * 3);
  const coneCenter = [width / 2, 0, depth / 2];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < width; y++) {
      for (let z = 0; z < depth; z++) {
        const p = vec3.sub([x, y, z], coneCenter);
        const index = convert3DTo1D([width, height, depth], [x, y, z]);

        // Trunk
        const trunkAngle = 88 * (3.1423 / 180);
        const sinCosTrunkAngle = vec2.create(
          Math.sin(trunkAngle),
          Math.cos(trunkAngle),
        );
        const trunkP = [p[0], p[1] - height, p[2]];
        if (sdCone(trunkP, sinCosTrunkAngle, height) <= 0) {
          const red = 32;
          const green = 32;
          const blue = 0;
          cache[index * 3] = red;
          cache[index * 3 + 1] = green;
          cache[index * 3 + 2] = blue;
          continue;
        }

        // Leaves
        const angle = 25 * (3.1423 / 180);
        const sinCosAngle = vec2.create(Math.sin(angle), Math.cos(angle));
        const cones = Array.from({ length: 12 }, (_, i) => {
          const coneHeight = (1.0 - i / 12) * maxConeSize;
          const coneY = (i / 12) * height + coneHeight;
          let coneP = [p[0], p[1] - coneY, p[2]];
          // const noise = fractalNoise3D(p[0], p[1], p[2], 0.2, 1);
          // coneP[1] += noise * 0.2;
          return Math.max(
            -sdCone(coneP, sinCosAngle, coneHeight),
            sdCone(vec3.sub(coneP, [0, 1, 0]), sinCosAngle, coneHeight),
          );
        });
        if (cones.some((v) => v <= 0)) {
          const snowNoise = fractalNoise3D(p[0], p[1], p[2], 1.0, 2);
          // if (snowNoise > 0.1) {
          //   const red = 255;
          //   const green = 255;
          //   const blue = 255;
          //   cache[index * 3] = red;
          //   cache[index * 3 + 1] = green;
          //   cache[index * 3 + 2] = blue;
          // } else {
          const red = 0;
          const green = 64 - myrng() * 16;
          const blue = 0;
          cache[index * 3] = red;
          cache[index * 3 + 1] = green;
          cache[index * 3 + 2] = blue;
          // }
        }
      }
    }
  }

  return (x: number, y: number, z: number, yStart: number) => {
    const offsetY = y + yStart;
    const index = convert3DTo1D([width, height, depth], [x, offsetY, z]);
    const red = cache[index * 3];
    const green = cache[index * 3 + 1];
    const blue = cache[index * 3 + 2];
    if (red === 0 && green === 0 && blue === 0) {
      return null;
    }
    if (
      x < 0 ||
      offsetY < 0 ||
      z < 0 ||
      x >= width ||
      offsetY >= height ||
      z >= depth
    ) {
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

export const getTerrainVoxel = (
  x: number,
  y: number,
  z: number,
  yStart: number,
  noiseCache: NoiseCache2D,
) => {
  const terrainNoise = noiseCache.get([x, z]);
  let offsetY = y + yStart;
  if (offsetY <= Math.floor(terrainNoise * CHUNK_HEIGHT)) {
    const white = 255 - myrng() * 32;
    const colour = [white, white, white];
    return { red: colour[0], green: colour[1], blue: colour[2], solid: true };
  }
  return null;
};

const nearestN = (v: number, n: number) => Math.floor(v / n) * n;

const getTreeVoxel = await getSdfTreeCache();

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

  const treeRepeatX = 64;
  const treeRepeatZ = 64;

  const leafCache = new VoxelCache({
    getVoxel: (x, y, z) => {
      const terrainVoxel = getTerrainVoxel(x, y, z, position[1], noiseCache);
      const terrainNoise = noiseCache.get([
        nearestN(x, treeRepeatX),
        nearestN(z, treeRepeatX),
      ]);
      const terrainHeight = terrainNoise * CHUNK_HEIGHT;
      const treeVoxel = getTreeVoxel(
        x % treeRepeatX,
        y - Math.floor(terrainHeight),
        z % treeRepeatZ,
        position[1],
      );
      return treeVoxel ?? terrainVoxel;
    },
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
