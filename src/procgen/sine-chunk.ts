import {
  GetVoxel,
  Octree,
  OCTREE_STRIDE,
  setInternalNode,
  setLeafNode,
} from "@renderer/octree/octree";
import { createNoise3D } from "simplex-noise";
import { expose } from "comlink";
import seedrandom from "seedrandom";

const myrng = seedrandom("crystals");
const noise3D = createNoise3D(myrng);

const fractalNoise3D = (
  x: number,
  y: number,
  z: number,
  octaves: number = 3,
  persistence: number = 0.5, // controls amplitude scaling between octaves
) => {
  let totalWeight = 0;
  let value = 0;
  let amplitude = 1;

  for (let i = 0; i < octaves; i++) {
    const scale = 1 << i; // scale doubles each octave
    value += noise3D(x * scale, y * scale, z * scale) * amplitude;
    totalWeight += amplitude;
    amplitude *= persistence; // reduce amplitude for each octave
  }

  return value / totalWeight; // normalize the result
};

const ridgedFractalNoise3D = (
  x: number,
  y: number,
  z: number,
  octaves: number = 3,
  persistence: number = 0.5,
) => {
  let totalWeight = 0;
  let value = 0;
  let amplitude = 1;

  for (let i = 0; i < octaves; i++) {
    const scale = 1 << i;
    value += Math.abs(noise3D(x * scale, y * scale, z * scale)) * amplitude;
    totalWeight += amplitude;
    amplitude *= persistence;
  }

  return value / totalWeight;
};

function easeInCubic(x: number): number {
  return x * x * x;
}

function easeInCirc(x: number): number {
  return 1 - Math.sqrt(1 - Math.pow(x, 2));
}

function easeOutCirc(x: number): number {
  return Math.sqrt(1 - Math.pow(x - 1, 2));
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export const CHUNK_HEIGHT = 384;

let octree: Octree;

const NOISE_FREQUENCY = 1536;

export const getTerrainVoxel: GetVoxel = (x, y, z) => {
  const n = fractalNoise3D(
    x / NOISE_FREQUENCY,
    y / NOISE_FREQUENCY,
    z / NOISE_FREQUENCY,
    3,
  );
  // 0 at the y top, 1 at the bottom
  const squashFactor = y / CHUNK_HEIGHT;
  const density = easeInOutCubic((n + 1) / 2);
  const randomSpeckle = myrng();

  if (density > squashFactor) {
    if (y > CHUNK_HEIGHT * 0.75) {
      return { red: 255 - randomSpeckle * 128, green: 0, blue: 0 };
    }
    if (y > CHUNK_HEIGHT * 0.55) {
      return {
        red: 255 - randomSpeckle * 128,
        green: 255 - randomSpeckle * 128,
        blue: 0,
      };
    }
    if (y > CHUNK_HEIGHT * 0.25) {
      return { red: 0, green: 255 - randomSpeckle * 128, blue: 0 };
    }
    return { red: 0, green: 0, blue: 255 - randomSpeckle * 128 };
  }
  return null;
};

export const createOctreeAndReturnBytes = (
  position: [number, number, number],
  size: [number, number, number],
) => {
  const getVoxel = (x: number, y: number, z: number) =>
    getTerrainVoxel(x + position[0], y + position[1], z + position[2]);
  const getMinVoxelSize = (x: number, y: number, z: number) => {
    // const distanceToOrigin = Math.sqrt(
    //   x + position[0] ** 2 + y + position[1] ** 2 + z + position[2] ** 2,
    // );
    // if (distanceToOrigin > 1024) {
    //   return 8;
    // }
    // if (distanceToOrigin > 512) {
    //   return 4;
    // }
    // if (distanceToOrigin > 256) {
    //   return 2;
    // }
    return 1;
  };
  octree = new Octree(getVoxel, getMinVoxelSize, Math.max(...size));
  return octree.totalSize + OCTREE_STRIDE;
};

export const populateOctreeBuffer = (buffer: SharedArrayBuffer) => {
  const view = new DataView(buffer);
  octree.nodes.forEach((node, i) => {
    if ("red" in node) {
      setLeafNode(view, i, node);
    } else {
      setInternalNode(view, i, node);
    }
  });
  octree = undefined;
};

const worker = {
  createOctreeAndReturnBytes,
  populateOctreeBuffer,
};

export type TerrainWorker = typeof worker;

expose(worker);
