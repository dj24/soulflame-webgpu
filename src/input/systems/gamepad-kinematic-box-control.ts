import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { ImmovableBox } from "@physics/components/immovable-box";
import * as CANNON from "cannon-es";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
export class GamepadKinematicBoxControl extends System {
  componentsRequired = new Set([ImmovableBox, Transform, GamepadControllable]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    const physicsWorldEntity = this.ecs
      .getEntitiesithComponent(PhysicsWorldSingleton)
      .values()
      .next().value;
    const components = this.ecs.getComponents(physicsWorldEntity);
    const world = components.get(PhysicsWorldSingleton).world;

    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const kinematicComponent = components.get(ImmovableBox);
      const transformComponent = components.get(Transform);
      const controllableComponent = components.get(GamepadControllable);

      const gamepad = navigator.getGamepads()[controllableComponent.player];

      if (!gamepad) {
        return;
      }

      const right = vec3.mulScalar(transformComponent.right, gamepad.axes[0]);
      const forward = vec3.mulScalar(
        transformComponent.direction,
        -gamepad.axes[1],
      );

      const direction = vec3.add(right, forward);

      const newPosition = vec3.add(
        transformComponent.position,
        vec3.mulScalar(direction, controllableComponent.speed),
      );

      const bodyInWorld = world.getBodyById(kinematicComponent.bodyId);

      if (!bodyInWorld) {
        continue;
      }

      bodyInWorld.position.set(newPosition[0], newPosition[1], newPosition[2]);

      const newRotation = quat.rotateY(
        transformComponent.rotation,
        controllableComponent.rotationSpeed * gamepad.axes[2],
      );

      const isButtonAPressed = gamepad.buttons[0].pressed;
      const isButtonBPressed = gamepad.buttons[1].pressed;

      const scaleSpeed = 0.001 * deltaTime;

      if (isButtonAPressed) {
        transformComponent.scale = vec3.add(
          transformComponent.scale,
          vec3.create(scaleSpeed, scaleSpeed, scaleSpeed),
        );
      }
      if (isButtonBPressed) {
        transformComponent.scale = vec3.sub(
          transformComponent.scale,
          vec3.create(scaleSpeed, scaleSpeed, scaleSpeed),
        );
      }

      world
        .getBodyById(kinematicComponent.bodyId)
        .quaternion.set(
          newRotation[0],
          newRotation[1],
          newRotation[2],
          newRotation[3],
        );
    }
  }
}
