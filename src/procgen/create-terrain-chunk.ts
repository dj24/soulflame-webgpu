import { VolumeAtlas } from "@renderer/volume-atlas";
import { wrap } from "comlink";
import { VoxelObject } from "@renderer/voxel-object";
import { CHUNK_HEIGHT, TerrainWorker } from "./sine-chunk";
import { OCTREE_STRIDE } from "@renderer/octree/octree";

let chunkCreationTimes: number[] = [];

const getMaxSizeOfOctree = (size: [number, number, number]) => {
  const depth = Math.ceil(Math.log2(Math.max(...size)));
  let total = 0;
  for (let i = 0; i < depth; i++) {
    total += 1 << (3 * i); // 1 << (3 * i) is equivalent to Math.pow(8, i)
  }
  return total;
};

export const createTerrainChunk = async (
  volumeAtlas: VolumeAtlas,
  width: number,
  position: [number, number, number],
  size: [number, number, number],
  createOctreeAndReturnBytes: (
    position: [number, number, number],
    size: [number, number, number],
    buffer: SharedArrayBuffer,
  ) => Promise<number>,
) => {
  const start = performance.now();
  const name = `Terrain - ${position[0]}, ${position[1]}, ${position[2]}`;
  const uncompressedSize = getMaxSizeOfOctree(size) * OCTREE_STRIDE;
  let uncompressedArrayBuffer = new SharedArrayBuffer(uncompressedSize);
  const octreeSizeBytes = await createOctreeAndReturnBytes(
    position,
    size,
    uncompressedArrayBuffer,
  );

  // Only one node, skip the octree
  if (octreeSizeBytes <= 16) {
    return;
  }

  await volumeAtlas.addVolume(
    name,
    size,
    uncompressedArrayBuffer,
    octreeSizeBytes,
  );

  uncompressedArrayBuffer = null;

  const {
    size: atlasSize,
    location,
    paletteIndex,
    octreeOffset,
  } = volumeAtlas.dictionary[name];

  const end = performance.now();
  chunkCreationTimes.push(end - start);
  console.log(
    `Average chunk creation time: ${(chunkCreationTimes.reduce((a, b) => a + b, 0) / chunkCreationTimes.length).toFixed(0)}`,
  );
  return new VoxelObject({
    name,
    size: atlasSize,
    atlasLocation: location,
    paletteIndex,
    octreeBufferIndex: octreeOffset,
  });
};
