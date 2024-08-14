import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { mat4, quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";

export class KeyboardControl extends System {
  keyboardControls = new KeyboardControls();
  componentsRequired = new Set([Transform, KeyboardControllable]);

  update(entities: Set<Entity>, now: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transformComponent = components.get(Transform);
      const controllableComponent = components.get(KeyboardControllable);

      if (this.keyboardControls.pressed.a) {
        transformComponent.position = vec3.add(
          transformComponent.position,
          vec3.mulScalar(transformComponent.left, controllableComponent.speed),
        );
      }
      if (this.keyboardControls.pressed.d) {
        transformComponent.position = vec3.add(
          transformComponent.position,
          vec3.mulScalar(transformComponent.right, controllableComponent.speed),
        );
      }
      if (this.keyboardControls.pressed.w) {
        transformComponent.position = vec3.add(
          transformComponent.position,
          vec3.mulScalar(
            transformComponent.direction,
            controllableComponent.speed,
          ),
        );
      }
      if (this.keyboardControls.pressed.s) {
        transformComponent.position = vec3.sub(
          transformComponent.position,
          vec3.mulScalar(
            transformComponent.direction,
            controllableComponent.speed,
          ),
        );
      }
      if (this.keyboardControls.pressed.q) {
        transformComponent.rotation = quat.rotateY(
          transformComponent.rotation,
          -controllableComponent.rotationSpeed,
        );
      }
      if (this.keyboardControls.pressed.e) {
        transformComponent.rotation = quat.rotateY(
          transformComponent.rotation,
          controllableComponent.rotationSpeed,
        );
      }
      if (this.keyboardControls.pressed[" "]) {
        transformComponent.position = vec3.add(
          transformComponent.position,
          vec3.mulScalar(transformComponent.up, controllableComponent.speed),
        );
      }
      if (this.keyboardControls.pressed.shift) {
        transformComponent.position = vec3.add(
          transformComponent.position,
          vec3.mulScalar(transformComponent.down, controllableComponent.speed),
        );
      }
    }
  }
}
