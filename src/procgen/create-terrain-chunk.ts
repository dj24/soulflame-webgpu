import { VolumeAtlas } from "@renderer/volume-atlas";
import { wrap } from "comlink";
import { Octree, octreeToArrayBuffer } from "@renderer/octree/octree";
import { VoxelObject } from "@renderer/voxel-object";
import { CHUNK_HEIGHT, createSineTerrain } from "./sine-chunk";
import { TVoxels } from "@renderer/convert-vxm";

const worker = new Worker(new URL("./sine-chunk", import.meta.url));
const terrainWorker = wrap<import("./sine-chunk").TerrainWorker>(worker);

export const createTerrainChunk = async (
  volumeAtlas: VolumeAtlas,
  size: number,
  position: [number, number, number],
) => {
  const frequency = 512;
  const name = `Terrain - ${position[0]}, ${position[1]}, ${position[2]}`;
  const voxelsBuffer = new SharedArrayBuffer(size * CHUNK_HEIGHT * size * 4);
  const coloursBuffer = new SharedArrayBuffer(size * CHUNK_HEIGHT * size * 4);
  const { VOX, SIZE } = await terrainWorker.createSineTerrain(
    size,
    frequency,
    position,
    voxelsBuffer,
    coloursBuffer,
  );

  const arr = Array.from(new Uint8Array(voxelsBuffer));
  let XYZI: TVoxels["XYZI"] = [];
  for (let i = 0; i < arr.length; i += 4) {
    const x = arr[i];
    const y = arr[i + 1];
    const z = arr[i + 2];
    const c = arr[i + 3];
    if (x === 0 && y === 0 && z === 0 && c === 0 && i > 0) {
      break;
    }
    XYZI.push({
      x,
      y,
      z,
      c,
    });
  }

  const colours = Array.from(new Uint8Array(coloursBuffer));
  let RGBA: TVoxels["RGBA"] = [];

  for (let i = 0; i < colours.length; i += 4) {
    const r = colours[i];
    const g = colours[i + 1];
    const b = colours[i + 2];
    const a = colours[i + 3];
    if (r === 0 && g === 0 && b === 0 && a === 0) {
      break;
    }
    RGBA.push({
      r,
      g,
      b,
      a,
    });
  }

  const voxels: TVoxels = {
    VOX,
    SIZE,
    XYZI,
    RGBA,
  };

  // const voxels = createSineTerrain(size, frequency, position);
  // TODO: move octree to worker
  const octree = new Octree(voxels);
  const octreeArrayBuffer = octreeToArrayBuffer(octree);
  await volumeAtlas.addVolume(
    name,
    [size, CHUNK_HEIGHT, size],
    octreeArrayBuffer,
  );
  const {
    size: atlasSize,
    location,
    paletteIndex,
    octreeOffset,
  } = volumeAtlas.dictionary[name];

  return new VoxelObject({
    name,
    size: atlasSize,
    atlasLocation: location,
    paletteIndex,
    octreeBufferIndex: octreeOffset,
  });
};
