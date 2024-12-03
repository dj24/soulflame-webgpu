import { VolumeAtlas } from "@renderer/volume-atlas";
import { VoxelObject } from "@renderer/voxel-object";
import {
  CHUNK_HEIGHT,
  createOctreeAndReturnBytes,
  encodeTerrainName,
} from "./sine-chunk";
import { OCTREE_STRIDE } from "@renderer/octree/octree";
import { ECS } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { getGPUDeviceSingleton } from "../abstractions/get-gpu-device-singleton";
import { chunkWidth } from "./systems/terrain-system";
import { TerrainChunk } from "./components/terrain-chunk";

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
  const startTime = performance.now();
  const newEntity = ecs.addEntity();
  const [x, y, z] = position;

  const name = encodeTerrainName(position, size);
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
  const device = getGPUDeviceSingleton(ecs).device;

  // Resize the buffer to the correct size
  const oldArray = new Uint8Array(uncompressedArrayBuffer);
  const resizedArray = new Uint8Array(octreeSizeBytes);
  resizedArray.set(oldArray.subarray(0, octreeSizeBytes));

  const gpuBuffer = device.createBuffer({
    size: octreeSizeBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  device.queue.writeBuffer(gpuBuffer, 0, resizedArray);
  await device.queue.onSubmittedWorkDone();
  const voxelObject = new VoxelObject({
    name,
    size: [size[0], extentY, size[2]],
    octreeBufferIndex: 0,
    gpuBuffer,
    octreeBuffer: resizedArray.buffer,
  });
  const endTime = performance.now();
  chunkCreationTimes.push(endTime - startTime);
  averageChunkCreationTime.time =
    chunkCreationTimes.reduce((a, b) => a + b, 0) / chunkCreationTimes.length;

  ecs.addComponent(newEntity, voxelObject);
  const transform = new Transform(
    [x + chunkWidth / 2, y - (CHUNK_HEIGHT - extentY) / 2, z + chunkWidth / 2],
    quat.fromEuler(0, 0, 0, "xyz"),
    [1, 1, 1],
  );
  ecs.addComponent(newEntity, new TerrainChunk(size[0], position));
  ecs.addComponent(newEntity, transform);
};
