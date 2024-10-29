import { ECS, Entity, System } from "@ecs/ecs";
import { TerrainSingleton } from "../components/terrain-singleton";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { createTerrainChunk } from "../create-terrain-chunk";
import { VoxelObject } from "@renderer/voxel-object";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { wrap } from "comlink";
import { CHUNK_HEIGHT } from "../sine-chunk";
import { mergeOctrees } from "@renderer/octree/merge-octrees";
import { animate, spring } from "motion";
import { processNewVoxelImport } from "@renderer/create-tavern";

const chunkWidth = 128;

const workerCount = navigator.hardwareConcurrency || 4;

const foo = async (ecs: ECS) => {
  const volumeAtlas = getGPUDeviceSingleton(ecs).volumeAtlas;

  // Create workers based on the number of cores
  const terrainWorkers = Array.from({ length: Math.floor(workerCount) }, () => {
    return new Worker(new URL("../sine-chunk", import.meta.url));
  });

  const terrainWorkerFunctions = terrainWorkers.map((worker) => {
    return wrap<import("../sine-chunk").TerrainWorker>(worker);
  });

  // Get all the chunk positions
  let chunkPositions: [number, number, number][] = [];
  for (let x = 0; x < 1024; x += chunkWidth) {
    for (let z = 0; z < 1024; z += chunkWidth) {
      // Iterate from the top of the world down, so we can skip when we hit empty chunks
      for (let y = 0; y < CHUNK_HEIGHT; y += chunkWidth) {
        chunkPositions.push([x, y, z]);
      }
    }
  }

  const assignChunkToWorker = async ([x, y, z]: number[], index: number) => {
    await createTerrainChunk(
      ecs,
      volumeAtlas,
      chunkWidth,
      [x, y, z],
      [chunkWidth, chunkWidth, chunkWidth],
      terrainWorkerFunctions[index].createOctreeAndReturnBytes,
    );
    return index;
  };

  // Assign workers to initial chunks
  let activeWorkers: Promise<number>[] = [];

  // Continue assigning chunks to workers while there are chunks left
  while (chunkPositions.length > 0) {
    // If there are still chunks left and there are available workers, assign a chunk
    if (activeWorkers.length < workerCount) {
      const [x, y, z] = chunkPositions.shift();
      const index = activeWorkers.length;
      activeWorkers[index] = assignChunkToWorker([x, y, z], index);
      continue;
    }

    // Wait for the first available worker to finish
    const finishedWorkerIndex = await Promise.race(activeWorkers);

    // Get the next chunk position and assign it to the worker that just finished
    activeWorkers[finishedWorkerIndex] = assignChunkToWorker(
      chunkPositions.shift(),
      finishedWorkerIndex,
    );
  }

  // Wait for all workers to finish
  await Promise.all(activeWorkers);

  // Clean up workers
  terrainWorkers.forEach((worker) => worker.terminate());
};
export class TerrainSystem extends System {
  componentsRequired = new Set([TerrainSingleton]);
  isInitialized = false;

  update(entities: Set<Entity>) {
    const gpuSingleton = getGPUDeviceSingleton(this.ecs);
    if (!gpuSingleton.device || entities.size === 0) {
      return;
    }
    const components = this.ecs.getComponents(entities.values().next().value);
    const terrainSingleton = components.get(TerrainSingleton);

    if (!this.isInitialized) {
      foo(this.ecs);
      // DEBUG
      processNewVoxelImport(
        "./Tavern/teapot.vxm",
        gpuSingleton.device,
        gpuSingleton.volumeAtlas,
      ).then((voxels) => {
        const newEntity = this.ecs.addEntity();
        this.ecs.addComponent(newEntity, voxels);
        const transform = new Transform(
          [0, 32, 160],
          quat.fromEuler(0, 0, 0, "xyz"),
          [0.5, 0.5, 0.5],
        );
        this.ecs.addComponent(newEntity, transform);
      });
      processNewVoxelImport(
        "./Tavern/dragon.vxm",
        gpuSingleton.device,
        gpuSingleton.volumeAtlas,
      ).then((voxels) => {
        const newEntity = this.ecs.addEntity();
        this.ecs.addComponent(newEntity, voxels);
        const transform = new Transform(
          [0, 32, 64],
          quat.fromEuler(0, 0, 0, "xyz"),
          [0.5, 0.5, 0.5],
        );
        this.ecs.addComponent(newEntity, transform);
      });
      this.isInitialized = true;
    }
  }
}
