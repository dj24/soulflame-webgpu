import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { mat4, quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { Velocity } from "../../components/velocity";
import { animate, glide } from "motion";

const DAMPING = 0.01;
const ROTATION_DAMPING = 0.01;

export class KeyboardControl extends System {
  keyboardControls = new KeyboardControls();
  componentsRequired = new Set([Transform, KeyboardControllable, Velocity]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transformComponent = components.get(Transform);
      const controllableComponent = components.get(KeyboardControllable);
      const velocityComponent = components.get(Velocity);
      let positionDelta = vec3.create();

      if (this.keyboardControls.pressed.a) {
        positionDelta = vec3.add(positionDelta, transformComponent.left);
      }
      if (this.keyboardControls.pressed.d) {
        positionDelta = vec3.add(positionDelta, transformComponent.right);
      }
      if (this.keyboardControls.pressed.w) {
        positionDelta = vec3.add(positionDelta, transformComponent.direction);
      }
      if (this.keyboardControls.pressed.s) {
        positionDelta = vec3.add(
          positionDelta,
          vec3.negate(transformComponent.direction),
        );
      }
      if (this.keyboardControls.pressed[" "]) {
        positionDelta = vec3.add(positionDelta, transformComponent.up);
      }
      if (this.keyboardControls.pressed.shift) {
        positionDelta = vec3.add(
          positionDelta,
          vec3.negate(transformComponent.up),
        );
      }

      // position
      positionDelta = vec3.normalize(positionDelta);
      const targetVelocity = vec3.mulScalar(
        positionDelta,
        controllableComponent.speed,
      );
      animate(
        (progress) => {
          velocityComponent.velocity = vec3.lerp(
            velocityComponent.velocity,
            targetVelocity,
            progress,
          );
        },
        {
          easing: glide({
            velocity: 0.003 * deltaTime,
          }),
        },
      );
    }
  }
}
