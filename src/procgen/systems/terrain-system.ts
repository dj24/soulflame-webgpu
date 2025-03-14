import { ECS, Entity, System } from "@ecs/ecs";
import { TerrainSingleton } from "../components/terrain-singleton";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { createTerrainChunk } from "../create-terrain-chunk";
import { wrap } from "comlink";
import { CHUNK_HEIGHT } from "../sine-chunk";
import { processNewVoxelImport } from "@renderer/create-tavern";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { DebugRotate } from "../../components/debug-rotate";
import { Light } from "@renderer/components/light";
import { Krampus } from "../../xmas-game-jam-2024/components/krampus";
import { BoxRayIntersect } from "../../components/box-ray-intersect";
import { PitchYaw } from "../../xmas-game-jam-2024/components/pitch-yaw";
import { Present } from "../../xmas-game-jam-2024/components/present";

export const chunkWidth = 64;

const workerCount = navigator.hardwareConcurrency || 4;

// Worker pool to process one task and shut down upon completion
class OneShotWorkerPool<T> {
  workers: Worker[] = [];
  workQueue: T[] = [];
  workFunction: (workItem: T, workerIndex: number) => Promise<number>;

  constructor(
    worker: Worker,
    workFunction: (workItem: T, workerIndex: number) => Promise<number>,
    workQueue: T[] = [],
  ) {
    this.workers = Array.from(
      { length: Math.floor(workerCount) },
      () => worker,
    );
    this.workFunction = workFunction;
    this.workQueue = workQueue;
  }

  async go() {
    // Assign workers to initial chunks
    let activeWorkers: Promise<number>[] = [];

    // Continue assigning chunks to workers while there are chunks left
    while (this.workQueue.length > 0) {
      // If there are still chunks left and there are available workers, assign a chunk
      if (activeWorkers.length < workerCount) {
        const workItem = this.workQueue.shift();
        const index = activeWorkers.length;
        activeWorkers[index] = this.workFunction(workItem, index);
        continue;
      }

      // Wait for the first available worker to finish
      const finishedWorkerIndex = await Promise.race(activeWorkers);

      // Get the next chunk position and assign it to the worker that just finished
      activeWorkers[finishedWorkerIndex] = this.workFunction(
        this.workQueue.shift(),
        finishedWorkerIndex,
      );
    }

    // Wait for all workers to finish
    await Promise.all(activeWorkers);

    // Clean up workers
    this.workers.forEach((worker) => worker.terminate());
  }
}

const foo = async (ecs: ECS) => {
  const volumeAtlas = getGPUDeviceSingleton(ecs).volumeAtlas;

  // Create workers based on the number of cores
  const terrainWorkers = Array.from({ length: Math.floor(workerCount) }, () => {
    return new Worker(new URL("../sine-chunk", import.meta.url));
  });

  const terrainWorkerFunctions = terrainWorkers.map((worker) => {
    return wrap<import("../sine-chunk").TerrainWorker>(worker);
  });

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

  // Get all the chunk positions
  let chunkPositions: [number, number, number][] = [];
  for (let x = 0; x < chunkWidth * 2; x += chunkWidth) {
    for (let z = 0; z < chunkWidth * 2; z += chunkWidth) {
      // Iterate from the top of the world down, so we can skip when we hit empty chunks
      for (let y = 0; y < CHUNK_HEIGHT; y += chunkWidth) {
        chunkPositions.push([x, y, z]);
      }
    }
  }

  const workerPool = new OneShotWorkerPool(
    new Worker(new URL("../sine-chunk", import.meta.url)),
    assignChunkToWorker,
    chunkPositions,
  );

  workerPool.go();
};
export class TerrainSystem extends System {
  componentsRequired = new Set([TerrainSingleton]);
  isInitialized = false;

  update(entities: Set<Entity>) {
    const gpuSingleton = getGPUDeviceSingleton(this.ecs);
    if (!gpuSingleton.device || entities.size === 0) {
      return;
    }

    if (!this.isInitialized) {
      foo(this.ecs);
      processNewVoxelImport("./sphere.vxm", gpuSingleton.device).then(
        (voxels) => {
          const newEntity = this.ecs.addEntity();
          this.ecs.addComponent(newEntity, voxels);
          const transform = new Transform(
            [32, 8, 32],
            quat.fromEuler(0, 0, 0, "xyz"),
            [0.5, 0.5, 0.5],
          );
          this.ecs.addComponent(newEntity, transform);
        },
      );
      // processNewVoxelImport("./Tavern/Dragon.vxm", gpuSingleton.device).then(
      //   (voxels) => {
      //     const newEntity = this.ecs.addEntity();
      //     this.ecs.addComponent(newEntity, voxels);
      //     const transform = new Transform(
      //       [64, 8, 32],
      //       quat.fromEuler(0, 0, 0, "xyz"),
      //       [0.25, 0.25, 0.25],
      //     );
      //     this.ecs.addComponent(newEntity, transform);
      //   },
      // );
      this.isInitialized = true;
    }
  }
}
