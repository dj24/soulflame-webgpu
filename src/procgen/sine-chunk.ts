import {
  createOctreeAndReturnBytes,
  populateOctreeBuffer,
} from "@renderer/octree/octree";
import { createNoise3D } from "simplex-noise";
import { expose, wrap } from "comlink";
import seedrandom from "seedrandom";
import { TVoxels } from "@renderer/convert-vxm";

var myrng = seedrandom("crystals");
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
let colours: TVoxels["RGBA"] = [];

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
  let highestY = 0;

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

        if (n > squashFactor) {
          if (y > highestY) {
            highestY = y;
          }
          const red = Math.floor((x / size) * 255);
          const green = Math.floor((y / CHUNK_HEIGHT) * 255);
          const blue = Math.floor((z / size) * 255);
          colours.push({
            r: red,
            g: green,
            b: blue,
            a: 0,
          });
          voxels.push(x, y, z, colours.length - 1);
        }
      }
    }
  }
  return {
    size: [size, highestY, size],
    voxelByteLength: voxels.length,
    colourByteLength: colours.length * 4,
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
  colours.forEach(({ r, g, b, a }, i) => {
    Atomics.store(coloursArray, i * 4, r);
    Atomics.store(coloursArray, i * 4 + 1, g);
    Atomics.store(coloursArray, i * 4 + 2, b);
    Atomics.store(coloursArray, i * 4 + 3, a);
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
