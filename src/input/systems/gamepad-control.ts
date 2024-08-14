import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GamepadControllable } from "@input/components/gamepad-controllable";

export class GamepadControl extends System {
  componentsRequired = new Set([Transform, GamepadControllable]);

  update(entities: Set<Entity>, now: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
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

      transformComponent.position = vec3.add(
        transformComponent.position,
        vec3.mulScalar(direction, controllableComponent.speed),
      );

      transformComponent.rotation = quat.rotateY(
        transformComponent.rotation,
        controllableComponent.rotationSpeed * gamepad.axes[2],
      );
    }
  }
}
