import { Entity, System } from "@ecs/ecs";
import { GravityBox } from "@physics/components/gravity-box";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { Transform } from "@renderer/components/transform";

export class GravitySystem extends System {
  componentsRequired = new Set([GravityBox, Transform]);
  addedEntities = new Set<Entity>();

  update(entities: Set<Entity>, now: number, deltaTime: number) {
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
        const position = components.get(Transform).position;
        const halfExtents = gravityBox.halfExtents;
        gravityBox.body.position.set(
          position[0] - halfExtents.x,
          position[1] - halfExtents.y,
          position[2] - halfExtents.z,
        );
        this.addedEntities.add(entity);
        world.addBody(gravityBox.body);
      }
    }

    // Remove any entities that have been removed from the ECS.
    for (const entity of this.addedEntities) {
      if (!entities.has(entity)) {
        const components = this.ecs.getComponents(entity);
        const gravityBox = components.get(GravityBox);
        world.removeBody(gravityBox.body);
      }
    }

    // Step the physics world.
    world.fixedStep();

    // Update the transforms of the entities.
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const gravityBox = components.get(GravityBox);
      const transform = components.get(Transform);
      const body = gravityBox.body;
      const { x, y, z } = body.position;
      const { x: rx, y: ry, z: rz, w: rw } = body.quaternion;

      const halfExtents = gravityBox.halfExtents;
      transform.position = [
        x + halfExtents.x,
        y + halfExtents.y,
        z + halfExtents.z,
      ];
      transform.rotation = [rx, ry, rz, rw];
    }
  }
}
