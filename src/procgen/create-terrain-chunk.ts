import { VolumeAtlas } from "@renderer/volume-atlas";
import { wrap } from "comlink";
import { VoxelObject } from "@renderer/voxel-object";
import { CHUNK_HEIGHT } from "./sine-chunk";
import { TVoxels } from "@renderer/convert-vxm";

const terrainWorker = new Worker(new URL("./sine-chunk", import.meta.url));
const { createSineTerrain, populateTerrainBuffer } =
  wrap<import("./sine-chunk").TerrainWorker>(terrainWorker);

const octreeWorker = new Worker(
  new URL("../renderer/octree/octree", import.meta.url),
);
const { createOctreeAndReturnBytes, populateOctreeBuffer } =
  wrap<import("../renderer/octree/octree").OctreeWorker>(octreeWorker);

export const createTerrainChunk = async (
  volumeAtlas: VolumeAtlas,
  width: number,
  position: [number, number, number],
) => {
  const frequency = 512;
  const name = `Terrain - ${position[0]}, ${position[1]}, ${position[2]}`;

  const { size, colourByteLength, voxelByteLength } = await createSineTerrain(
    width,
    frequency,
    position,
  );

  const voxelsBuffer = new SharedArrayBuffer(colourByteLength);
  const coloursBuffer = new SharedArrayBuffer(voxelByteLength);
  await populateTerrainBuffer(voxelsBuffer, coloursBuffer);
  const octreeSizeBytes = await createOctreeAndReturnBytes(
    voxelsBuffer,
    coloursBuffer,
    size,
  );
  const octreeArrayBuffer = new SharedArrayBuffer(octreeSizeBytes);
  await populateOctreeBuffer(octreeArrayBuffer);
  await volumeAtlas.addVolume(
    name,
    [width, CHUNK_HEIGHT, width],
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
