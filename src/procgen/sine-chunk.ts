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

function easeInCirc(x: number): number {
  return 1 - Math.sqrt(1 - Math.pow(x, 2));
}

export const CHUNK_HEIGHT = 512;

let octree: Octree;

const NOISE_FREQUENCY = 512;

export const getTerrainVoxel: GetVoxel = (x, y, z) => {
  const n = fractalNoise3D(
    x / NOISE_FREQUENCY,
    y / NOISE_FREQUENCY,
    z / NOISE_FREQUENCY,
    4,
  );
  // 0 at the y top, 1 at the bottom
  const squashFactor = y / CHUNK_HEIGHT;
  const density = easeInCirc((n + 1) / 2);

  if (density > squashFactor) {
    const red = 1 - squashFactor * 255;
    const green = squashFactor * 255;
    const blue = 0;
    return { red, green, blue };
  }
  return null;
};

export const createOctreeAndReturnBytes = (
  position: [number, number, number],
  size: [number, number, number],
) => {
  const getVoxel = (x: number, y: number, z: number) =>
    getTerrainVoxel(x + position[0], y + position[1], z + position[2]);
  octree = new Octree(getVoxel, Math.max(...size));
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
