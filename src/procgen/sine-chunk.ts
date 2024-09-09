import {
  GetVoxel,
  Octree,
  OCTREE_STRIDE,
  setInternalNode,
  setLeafNode,
} from "@renderer/octree/octree";
import { expose } from "comlink";
import { fractalNoise3D, myrng } from "./fractal-noise-3d";
import { easeInOutCubic } from "./easing";
import { NoiseCache } from "./noise-cache";

export const CHUNK_HEIGHT = 128;

let octree: Octree;
let noiseCache: NoiseCache;
const NOISE_FREQUENCY = 0.001;

export const getTerrainVoxel: GetVoxel = (x, y, z) => {
  const n = fractalNoise3D(x, y, z, NOISE_FREQUENCY, 5);
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

export const getCachedVoxel = (x: number, y: number, z: number) => {
  const n = noiseCache.get([x, y, z]);
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
    return { red: 64, green: 64, blue: 255 - randomSpeckle * 128 };
  }
  return null;
};

export const createOctreeAndReturnBytes = (
  position: [number, number, number],
  size: [number, number, number],
  buffer: SharedArrayBuffer,
) => {
  noiseCache = new NoiseCache(
    (x, y, z) =>
      fractalNoise3D(
        x + position[0],
        y + position[1],
        z + position[2],
        NOISE_FREQUENCY,
        5,
      ),
    size,
  );

  const getVoxel = (x: number, y: number, z: number) => getCachedVoxel(x, y, z);

  const getMinVoxelSize = (x: number, y: number, z: number) => {
    return 1;
  };

  octree = new Octree(getVoxel, getMinVoxelSize, Math.max(...size), buffer);

  noiseCache = undefined;
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
