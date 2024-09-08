import { VolumeAtlas } from "@renderer/volume-atlas";
import { wrap } from "comlink";
import { VoxelObject } from "@renderer/voxel-object";
import { CHUNK_HEIGHT, TerrainWorker } from "./sine-chunk";

export const createTerrainChunk = async (
  volumeAtlas: VolumeAtlas,
  width: number,
  position: [number, number, number],
  size: [number, number, number],
  createOctreeAndReturnBytes: (
    position: [number, number, number],
    size: [number, number, number],
  ) => Promise<number>,
  populateOctreeBuffer: (octreeArrayBuffer: SharedArrayBuffer) => Promise<void>,
) => {
  const name = `Terrain - ${position[0]}, ${position[1]}, ${position[2]}`;
  const octreeSizeBytes = await createOctreeAndReturnBytes(position, size);

  // Only one node, skip the octree
  if (octreeSizeBytes <= 16) {
    return;
  }

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
