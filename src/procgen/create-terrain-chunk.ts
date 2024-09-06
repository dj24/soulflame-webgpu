import { VolumeAtlas } from "@renderer/volume-atlas";
import { wrap } from "comlink";
import { VoxelObject } from "@renderer/voxel-object";
import { CHUNK_HEIGHT } from "./sine-chunk";

export const createTerrainChunk = async (
  volumeAtlas: VolumeAtlas,
  width: number,
  position: [number, number, number],
  createSineTerrain: Function,
  populateTerrainBuffer: Function,
  createOctreeAndReturnBytes: Function,
  populateOctreeBuffer: Function,
) => {
  const frequency = 512;
  const name = `Terrain - ${position[0]}, ${position[1]}, ${position[2]}`;
  const { size, colourByteLength, voxelByteLength } = await createSineTerrain(
    width,
    frequency,
    position,
  );
  console.log({ size });
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
  await volumeAtlas.addVolume(name, size, octreeArrayBuffer);
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
