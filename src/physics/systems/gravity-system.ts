import { Entity, System } from "@ecs/ecs";
import { GravityBox } from "@physics/components/gravity-box";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { Transform } from "@renderer/components/transform";

export class GravitySystem extends System {
  componentsRequired = new Set([GravityBox, Transform]);
  addedEntities = new Set<Entity>();

  update(entities: Set<Entity>) {
    const physicsWorldEntity = this.ecs
      .getEntitiesithComponent(PhysicsWorldSingleton)
      .values()
      .next().value;
    const components = this.ecs.getComponents(physicsWorldEntity);
    const world = components.get(PhysicsWorldSingleton).world;

    // Add any new entities to the physics world.
    for (const entity of entities) {
      if (!this.addedEntities.has(entity)) {
        const components = this.ecs.getComponents(entity);
        const gravityBox = components.get(GravityBox);
        console.log("Adding gravity box to physics world");
        this.addedEntities.add(entity);
        world.add(gravityBox.body);
      }
    }

    // Remove any entities that have been removed from the ECS.
    for (const entity of this.addedEntities) {
      if (!entities.has(entity)) {
        world.remove(entity);
      }
    }

    // Step the physics world.
    world.step();

    // Update the transforms of the entities.
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const gravityBox = components.get(GravityBox);
      const transform = components.get(Transform);
      const body = world.getByName(gravityBox.body.name);
      const { x, y, z } = body.getPosition();
      const { x: rx, y: ry, z: rz, w: rw } = body.getQuaternion();
      transform.position = [x, y, z];
      transform.rotation = [rx, ry, rz, rw];
    }
  }
}
