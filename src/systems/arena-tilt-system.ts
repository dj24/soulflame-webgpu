import { Entity, System } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { Arena } from "../components/arena";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import * as CANNON from "cannon-es";
import { GravityBox } from "@physics/components/gravity-box";

export class ArenaTiltSystem extends System {
  componentsRequired = new Set([Arena, Transform, GravityBox]);
  springs: CANNON.Spring[];

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const physicsWorldEntity = this.ecs
      .getEntitiesithComponent(PhysicsWorldSingleton)
      .values()
      .next().value;
    const components = this.ecs.getComponents(physicsWorldEntity);
    const world = components.get(PhysicsWorldSingleton).world;

    const arenaEntity = entities.values().next().value;
    const arenaComponents = this.ecs.getComponents(arenaEntity);

    if (!arenaComponents) {
      return;
    }

    const transformComponent = arenaComponents.get(Transform);
    const gravityBoxComponent = arenaComponents.get(GravityBox);
    const { position } = transformComponent;

    // Initialize the arena, pivot and joint
    if (!this.springs) {
      const arenaBody = world.getBodyById(gravityBoxComponent.bodyId);
      const scaledHalfExtents = [
        gravityBoxComponent.halfExtents.x * transformComponent.scale[0],
        gravityBoxComponent.halfExtents.y * transformComponent.scale[1],
        gravityBoxComponent.halfExtents.z * transformComponent.scale[2],
      ];

      const corners = [
        [-scaledHalfExtents[0], -20, -scaledHalfExtents[2]],
        [-scaledHalfExtents[0], -20, scaledHalfExtents[2]],
        [scaledHalfExtents[0], -20, -scaledHalfExtents[2]],
        [scaledHalfExtents[0], -20, scaledHalfExtents[2]],
      ];

      this.springs = corners.map((corner) => {
        const [x, y, z] = corner;
        const pivotBody = new CANNON.Body({
          mass: 0,
          position: new CANNON.Vec3(x, y, z),
          shape: new CANNON.Box(new CANNON.Vec3(1, 1, 1)),
        });
        world.addBody(pivotBody);
        return new CANNON.Spring(arenaBody, pivotBody, {
          restLength: 0,
          stiffness: 100,
          damping: 10,
          localAnchorA: new CANNON.Vec3(x, 0, z),
          localAnchorB: new CANNON.Vec3(0, 1, 0),
        });
      });
    }

    this.springs.forEach((spring) => {
      spring.applyForce();
    });
  }
}
