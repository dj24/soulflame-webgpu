import { Entity, System } from "@ecs/ecs";
import { Spawner } from "@input/components/spawner";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { GravityBox } from "@physics/components/gravity-box";
import { Bomb } from "../../components/bomb";

export class SpawnerSystem extends System {
  componentsRequired = new Set([Spawner]);
  timeSinceLastSpawn = 0;

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    this.timeSinceLastSpawn += deltaTime;
    if (this.timeSinceLastSpawn < 3000) {
      return;
    }
    this.timeSinceLastSpawn = 0;
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const spawnerConfig = components.get(Spawner);
      const voxelObjects = spawnerConfig.voxelObjects;
      const randomIndex = Math.floor(Math.random() * voxelObjects.length);
      const voxelObject = voxelObjects[randomIndex];
      const newEntity = this.ecs.addEntity();
      this.ecs.addComponents(newEntity, voxelObject);
      const x = Math.random() * 320 - 120;
      const y = 150;
      const z = Math.random() * 320 - 120;
      const minSize = Math.min(...voxelObject.size);
      const scale = 15 / minSize;
      this.ecs.addComponents(
        newEntity,
        new Transform([x, y, z], quat.identity(), [scale, scale, scale]),
        voxelObject,
        new GravityBox(voxelObject.size),
      );
      if (voxelObject.name === "Bomb") {
        this.ecs.addComponent(newEntity, new Bomb(3));
      }
    }
  }
}
