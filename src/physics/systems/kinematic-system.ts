import { Entity, System } from "@ecs/ecs";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { Transform } from "@renderer/components/transform";
import { ImmovableBox } from "@physics/components/immovable-box";
import * as CANNON from "cannon-es";
export class KinematicSystem extends System {
  componentsRequired = new Set([ImmovableBox, Transform]);
  addedEntities = new Map<Entity, CANNON.Body>();

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
        const transform = components.get(Transform);
        const { position } = transform;
        const body = new CANNON.Body({
          mass: 0,
          type: CANNON.Body.KINEMATIC,
          position: new CANNON.Vec3(position[0], position[1], position[2]),
          shape: new CANNON.Box(
            new CANNON.Vec3(
              immovableBox.halfExtents.x * transform.scale[0],
              immovableBox.halfExtents.y * transform.scale[1],
              immovableBox.halfExtents.z * transform.scale[2],
            ),
          ),
          ...immovableBox.options,
        });
        this.addedEntities.set(entity, body);
        immovableBox.bodyId = body.id;
        world.addBody(body);
      }
    }

    // Remove any entities that have been removed from the ECS.
    for (const [entity, body] of this.addedEntities) {
      if (!entities.has(entity)) {
        world.removeBody(body);
      }
    }

    // Update the transforms of the entities.
    for (const [entity, body] of this.addedEntities) {
      const components = this.ecs.getComponents(entity);
      const immovableBox = components.get(ImmovableBox);
      const transform = components.get(Transform);

      // Update the size of the rigid body to scale
      body.shapes[0] = new CANNON.Box(
        new CANNON.Vec3(
          immovableBox.halfExtents.x * transform.scale[0],
          immovableBox.halfExtents.y * transform.scale[1],
          immovableBox.halfExtents.z * transform.scale[2],
        ),
      );

      const { x, y, z } = body.position;
      const { x: rx, y: ry, z: rz, w: rw } = body.quaternion;
      transform.position = [x, y, z];
      transform.rotation = [rx, ry, rz, rw];
    }
  }
}
