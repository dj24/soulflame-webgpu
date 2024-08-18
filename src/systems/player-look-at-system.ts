import { Entity, System } from "@ecs/ecs";
import { GravityBox } from "@physics/components/gravity-box";
import { Transform } from "@renderer/components/transform";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { quat, vec3 } from "wgpu-matrix";
import { getPhysicsWorld } from "../abstractions/get-physics-world";
import { Player } from "../components/player";

export class PlayerLookAtSystem extends System {
  componentsRequired = new Set([
    GravityBox,
    Transform,
    GamepadControllable,
    Player,
  ]);

  update(entities: Set<Entity>, now: number): void {
    const world = getPhysicsWorld(this.ecs);
    // get the closest other matching entity, and rotate to look at it
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transformComponent = components.get(Transform);
      const gravityBoxComponent = components.get(GravityBox);

      let closestPlayerEntity: Entity | null = null;

      for (const otherEntity of entities) {
        if (otherEntity === entity) {
          continue;
        }

        closestPlayerEntity = otherEntity;
      }

      if (!closestPlayerEntity) {
        return;
      }

      const otherPlayerComponents = this.ecs.getComponents(closestPlayerEntity);
      const direction = vec3.sub(
        otherPlayerComponents.get(Transform).position,
        transformComponent.position,
      );

      // Rotate on the Y axis
      const newRotation = quat.fromEuler(
        0,
        Math.atan2(direction[0], direction[2]),
        0,
        "xyz",
      );

      const playerBody = world.getBodyById(gravityBoxComponent.bodyId);
      playerBody.quaternion.set(
        newRotation[0],
        newRotation[1],
        newRotation[2],
        newRotation[3],
      );
    }
  }
}
