import { Entity, System } from "@ecs/ecs";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { Transform } from "@renderer/components/transform";
import { ImmovableBox } from "@physics/components/immovable-box";

export class KinematicSystem extends System {
  componentsRequired = new Set([ImmovableBox, Transform]);
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
        const immovableBox = components.get(ImmovableBox);
        const position = components.get(Transform).position;
        const halfExtents = immovableBox.halfExtents;
        immovableBox.body.position.set(
          position[0] - halfExtents.x,
          position[1] - halfExtents.y,
          position[2] - halfExtents.z,
        );
        this.addedEntities.add(entity);
        world.addBody(immovableBox.body);
      }
    }

    // Remove any entities that have been removed from the ECS.
    for (const entity of this.addedEntities) {
      if (!entities.has(entity)) {
        const components = this.ecs.getComponents(entity);
        const immovableBox = components.get(ImmovableBox);
        world.removeBody(immovableBox.body);
      }
    }

    // Step the physics world.
    world.fixedStep();

    // Update the transforms of the entities.
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const immovableBox = components.get(ImmovableBox);
      const transform = components.get(Transform);
      const body = immovableBox.body;
      const { x, y, z } = body.position;
      const { x: rx, y: ry, z: rz, w: rw } = body.quaternion;
      const halfExtents = immovableBox.halfExtents;
      transform.position = [
        x + halfExtents.x,
        y + halfExtents.y,
        z + halfExtents.z,
      ];
      transform.rotation = [rx, ry, rz, rw];
    }
  }
}
