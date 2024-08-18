import { Entity, System } from "@ecs/ecs";
import { GravityBox } from "@physics/components/gravity-box";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { Transform } from "@renderer/components/transform";
import * as CANNON from "cannon-es";

export class GravitySystem extends System {
  componentsRequired = new Set([GravityBox, Transform]);
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
        const gravityBox = components.get(GravityBox);
        const position = components.get(Transform).position;
        const scale = components.get(Transform).scale;
        const body = new CANNON.Body({
          angularFactor: gravityBox.angularFactor,
          mass: gravityBox.mass,
          position: new CANNON.Vec3(position[0], position[1], position[2]),
          shape: new CANNON.Box(
            new CANNON.Vec3(
              gravityBox.halfExtents.x * scale[0],
              gravityBox.halfExtents.y * scale[1],
              gravityBox.halfExtents.z * scale[2],
            ),
          ),
        });
        this.addedEntities.set(entity, body);
        world.addBody(body);
        gravityBox.bodyId = body.id;
      }
    }

    // Remove any entities that have been removed from the ECS.
    for (const [entity, body] of this.addedEntities) {
      if (!entities.has(entity)) {
        world.removeBody(body);
      }
    }

    // Step the physics world.
    world.fixedStep();

    // Update the transforms of the entities.
    for (const [entity, body] of this.addedEntities) {
      const components = this.ecs.getComponents(entity);
      const gravityBox = components.get(GravityBox);
      const transform = components.get(Transform);

      // Update the size of the rigid body to scale
      body.shapes[0] = new CANNON.Box(
        new CANNON.Vec3(
          gravityBox.halfExtents.x * transform.scale[0],
          gravityBox.halfExtents.y * transform.scale[1],
          gravityBox.halfExtents.z * transform.scale[2],
        ),
      );

      const { x, y, z } = body.position;
      const { x: rx, y: ry, z: rz, w: rw } = body.quaternion;
      transform.previousTransform = transform.transform;
      transform.position = [x, y, z];
      transform.rotation = [rx, ry, rz, rw];
    }
  }
}
