import { ECS, Entity, System } from "@ecs/ecs";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { processNewVoxelImport } from "@renderer/create-tavern";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { DebugRotate } from "../../components/debug-rotate";
import { Spawner } from "../components/spawner";

export class SpawnerSystem extends System {
  componentsRequired = new Set([Spawner]);
  isInitialized = false;

  update(entities: Set<Entity>) {
    const gpuSingleton = getGPUDeviceSingleton(this.ecs);
    if (!gpuSingleton.device || entities.size === 0) {
      return;
    }

    if (!this.isInitialized) {
      processNewVoxelImport(
        "./xmas-game-jam-2024/floor.vxm",
        gpuSingleton.device,
      ).then((voxels) => {
        const newEntity = this.ecs.addEntity();
        this.ecs.addComponent(newEntity, voxels);
        const transform = new Transform(
          [64, 0, 64],
          quat.fromEuler(0, 0, 0, "xyz"),
          [1, 1, 1],
        );
        this.ecs.addComponent(newEntity, transform);
      });
      processNewVoxelImport(
        "./xmas-game-jam-2024/wall.vxm",
        gpuSingleton.device,
      ).then((voxels) => {
        const width = voxels.size[0];
        const height = voxels.size[1];
        const depth = voxels.size[2];
        for (let x = 0; x < 128; x += voxels.size[0]) {
          const newEntity = this.ecs.addEntity();
          this.ecs.addComponent(newEntity, voxels);
          const transform = new Transform(
            [x + width / 2, height / 2, 0],
            quat.fromEuler(0, 0, 0, "xyz"),
            [1, 1, 1],
          );
          this.ecs.addComponent(newEntity, transform);
        }
        for (let x = 0; x < 128; x += voxels.size[0]) {
          const newEntity = this.ecs.addEntity();
          this.ecs.addComponent(newEntity, voxels);
          const transform = new Transform(
            [x + width / 2, height / 2, 128],
            quat.fromEuler(0, Math.PI, 0, "xyz"),
            [1, 1, 1],
          );
          this.ecs.addComponent(newEntity, transform);
        }
        for (let z = 0; z < 128; z += voxels.size[0]) {
          const newEntity = this.ecs.addEntity();
          this.ecs.addComponent(newEntity, voxels);
          const transform = new Transform(
            [0, height / 2, z + 16],
            quat.fromEuler(0, Math.PI / 2, 0, "xyz"),
            [1, 1, 1],
          );
          this.ecs.addComponent(newEntity, transform);
        }
        for (let z = 0; z < 128; z += voxels.size[0]) {
          const newEntity = this.ecs.addEntity();
          this.ecs.addComponent(newEntity, voxels);
          const transform = new Transform(
            [128, height / 2, z + 16],
            quat.fromEuler(0, -Math.PI / 2, 0, "xyz"),
            [1, 1, 1],
          );
          this.ecs.addComponent(newEntity, transform);
        }
      });
      this.isInitialized = true;
    }
  }
}
