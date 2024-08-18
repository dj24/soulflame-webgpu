import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { ImmovableBox } from "@physics/components/immovable-box";
import * as CANNON from "cannon-es";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { GravityBox } from "@physics/components/gravity-box";
export class GamepadGravityBoxControl extends System {
  componentsRequired = new Set([GravityBox, Transform, GamepadControllable]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    const physicsWorldEntity = this.ecs
      .getEntitiesithComponent(PhysicsWorldSingleton)
      .values()
      .next().value;
    const components = this.ecs.getComponents(physicsWorldEntity);
    const world = components.get(PhysicsWorldSingleton).world;

    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const gravityBoxComponent = components.get(GravityBox);
      const transformComponent = components.get(Transform);
      const controllableComponent = components.get(GamepadControllable);
      const gamepad = navigator.getGamepads()[controllableComponent.player];

      if (!gamepad) {
        return;
      }

      const direction = vec3.create(gamepad.axes[0], 0, -gamepad.axes[1]);

      // Apply force to the gravity box
      world
        .getBodyById(gravityBoxComponent.bodyId)
        .applyForce(
          new CANNON.Vec3(
            direction[0] * controllableComponent.speed,
            direction[1] * controllableComponent.speed,
            direction[2] * controllableComponent.speed,
          ),
          new CANNON.Vec3(0, 2, 0),
        );

      const newRotation = quat.rotateY(
        transformComponent.rotation,
        controllableComponent.rotationSpeed * gamepad.axes[2],
      );

      world
        .getBodyById(gravityBoxComponent.bodyId)
        .quaternion.set(
          newRotation[0],
          newRotation[1],
          newRotation[2],
          newRotation[3],
        );
    }
  }
}
