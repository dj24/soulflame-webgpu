import { VolumeAtlas } from "@renderer/volume-atlas";
import { wrap } from "comlink";
import { VoxelObject } from "@renderer/voxel-object";
import {
  CHUNK_HEIGHT,
  createOctreeAndReturnBytes,
  TerrainWorker,
} from "./sine-chunk";
import { OCTREE_STRIDE } from "@renderer/octree/octree";
import { DebugUI } from "@renderer/ui";
import { ECS } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { animate, spring } from "motion";

let chunkCreationTimes: number[] = [];

let averageChunkCreationTime = {
  time: 0,
};

(window as any).debugUI.setupAverageChunkGenerationTimeLogging(
  averageChunkCreationTime,
);

export const getMaxSizeOfOctree = (size: [number, number, number]) => {
  const depth = Math.ceil(Math.log2(Math.max(...size)));
  let total = 0;
  for (let i = 0; i <= depth; i++) {
    const nodesAtDepth = 1 << (3 * i);
    total += nodesAtDepth;
  }
  return total;
};

export const createTerrainChunk = async (
  ecs: ECS,
  volumeAtlas: VolumeAtlas,
  width: number,
  position: [number, number, number],
  size: [number, number, number],
  createOctree: typeof createOctreeAndReturnBytes,
) => {
  const newEntity = ecs.addEntity();
  const [x, y, z] = position;
  const start = performance.now();
  const name = `Terrain - ${x}, ${y}, ${z}`;
  const uncompressedSize = getMaxSizeOfOctree(size) * OCTREE_STRIDE;
  let uncompressedArrayBuffer: SharedArrayBuffer | null = new SharedArrayBuffer(
    uncompressedSize,
  );
  const {
    bytes: octreeSizeBytes,
    boundsMin,
    boundsMax,
  } = await createOctree(position, size, uncompressedArrayBuffer);

  // Only one node, skip the octree
  if (octreeSizeBytes <= 16) {
    return;
  }

  const extentY = 1 + boundsMax[1] - boundsMin[1];

  await volumeAtlas.addVolume(
    name,
    size,
    uncompressedArrayBuffer,
    octreeSizeBytes,
  );

  uncompressedArrayBuffer = null;
  const { size: atlasSize, octreeOffset } = volumeAtlas.dictionary[name];
  const end = performance.now();
  chunkCreationTimes.push(end - start);
  averageChunkCreationTime.time =
    chunkCreationTimes.reduce((a, b) => a + b, 0) / chunkCreationTimes.length;
  averageChunkCreationTime.time = Math.round(averageChunkCreationTime.time);
  const voxelObject = new VoxelObject({
    name,
    size: [atlasSize[0], extentY, atlasSize[2]],
    octreeBufferIndex: octreeOffset,
  });
  ecs.addComponent(newEntity, voxelObject);
  const transform = new Transform(
    [x, y - (128 - extentY) / 2, z],
    quat.fromEuler(0, 0, 0, "xyz"),
    [0, 0, 0],
  );
  animate(
    (progress) => {
      transform.scale = [progress, progress, progress];
    },
    {
      duration: 1.0,
      easing: spring({
        damping: 100,
      }),
    },
  );
  ecs.addComponent(newEntity, transform);
};
