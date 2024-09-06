import {
  createOctreeAndReturnBytes,
  populateOctreeBuffer,
} from "@renderer/octree/octree";
import { createNoise3D } from "simplex-noise";
import { expose, wrap } from "comlink";
import seedrandom from "seedrandom";

var myrng = seedrandom("artlist");
const noise3D = createNoise3D(myrng);

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

function easeInCubic(x: number): number {
  return x * x * x;
}

export const CHUNK_HEIGHT = 256;

let voxels: number[] = [];
let colours: number[] = [];

type SineTerrain = {
  size: [number, number, number];
  voxelByteLength: number;
  colourByteLength: number;
};

export const createSineTerrain = (
  size: number,
  frequency: number,
  offset: [number, number, number],
): SineTerrain => {
  voxels = [];
  colours = [];
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
          4,
        );
        // 0 at the y top, 1 at the bottom
        const squashFactor = y / CHUNK_HEIGHT;
        const density = easeInCubic((n + 1) / 2);

        if (density > squashFactor) {
          const red = dirtColour.r * density + grassColour.r * (1 - density);
          const green = dirtColour.g * density + grassColour.g * (1 - density);
          const blue = dirtColour.b * density + grassColour.b * (1 - density);
          colours.push(red, green, blue, 255);
          voxels.push(x, y, z, colours.length / 4 - 1);
        }
      }
    }
  }
  return {
    size: [size, CHUNK_HEIGHT, size],
    voxelByteLength: voxels.length,
    colourByteLength: colours.length,
  };
};

const populateTerrainBuffer = (
  voxelBuffer: SharedArrayBuffer,
  coloursBuffer: SharedArrayBuffer,
) => {
  const voxelsArray = new Uint8Array(voxelBuffer);
  const coloursArray = new Uint8Array(coloursBuffer);
  voxels.forEach((v, i) => {
    Atomics.store(voxelsArray, i, v);
  });
  colours.forEach((c, i) => {
    Atomics.store(coloursArray, i, c);
  });
  voxels = [];
  colours = [];
};

const worker = {
  createSineTerrain,
  populateTerrainBuffer,
  createOctreeAndReturnBytes,
  populateOctreeBuffer,
};

export type TerrainWorker = typeof worker;

expose(worker);
