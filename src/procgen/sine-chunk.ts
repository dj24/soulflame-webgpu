import { TVoxels } from "@renderer/convert-vxm";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { Octree, octreeToArrayBuffer } from "@renderer/octree/octree";
import { VoxelObject } from "@renderer/voxel-object";
import { createNoise3D } from "simplex-noise";
import { expose, wrap } from "comlink";

const noise3D = createNoise3D();

const fractalNoise3D = (
  x: number,
  y: number,
  z: number,
  octaves: number = 3,
) => {
  let totalWeight = 0;
  let value = 0;
  for (let i = 0; i < octaves; i++) {
    const weight = 1 / (i + 1);
    totalWeight += weight;
    const scale = 1 << i;
    value += noise3D(x * scale, y * scale, z * scale) * weight;
  }
  return value / totalWeight;
};

export const CHUNK_HEIGHT = 256;

function easeInQuart(x: number): number {
  return x * x * x * x;
}

function easeInCubic(x: number): number {
  return x * x * x;
}

function easeInQuad(x: number): number {
  return x * x;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export const createSineTerrain = (
  size: number,
  frequency: number,
  offset: [number, number, number],
  voxelBuffer: SharedArrayBuffer,
  colourBuffer: SharedArrayBuffer,
): Omit<TVoxels, "XYZI" | "RGBA"> => {
  const voxels = new Uint8Array(voxelBuffer);
  const colours = new Uint8Array(colourBuffer);
  let voxelCount = 0;
  let colourCount = 0;
  const grassColour = { r: 0, g: 255, b: 0, a: 0 };
  const dirtColour = { r: 139, g: 69, b: 19, a: 0 };

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < size; z++) {
        const offsetX = x + offset[0];
        const offsetY = y + offset[1];
        const offsetZ = z + offset[2];

        const n = fractalNoise3D(
          offsetX / frequency,
          offsetY / frequency,
          offsetZ / frequency,
          2,
        );
        // 0 at the y top, 1 at the bottom
        const squashFactor = y / CHUNK_HEIGHT;
        const density = easeInCubic((n + 1) / 2);

        if (density > squashFactor) {
          const red = dirtColour.r * density + grassColour.r * (1 - density);
          const green = dirtColour.g * density + grassColour.g * (1 - density);
          const blue = dirtColour.b * density + grassColour.b * (1 - density);

          colourCount++;
          const baseColourIndex = (colourCount - 1) * 4;
          Atomics.store(colours, baseColourIndex, red);
          Atomics.store(colours, baseColourIndex + 1, green);
          Atomics.store(colours, baseColourIndex + 2, blue);
          Atomics.store(colours, baseColourIndex + 3, 255);

          voxelCount++;
          const baseVoxelIndex = (voxelCount - 1) * 4;
          Atomics.store(voxels, baseVoxelIndex, x);
          Atomics.store(voxels, baseVoxelIndex + 1, y);
          Atomics.store(voxels, baseVoxelIndex + 2, z);
          Atomics.store(voxels, baseVoxelIndex + 3, colourCount - 1);
        }
      }
    }
  }
  return {
    SIZE: [size, CHUNK_HEIGHT, size],
    VOX: voxels.length,
  };
};

const worker = {
  createSineTerrain,
};

export type TerrainWorker = typeof worker;

expose(worker);
