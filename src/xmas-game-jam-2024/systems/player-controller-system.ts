import { Component, Entity, System } from "@ecs/ecs";
import { BoxRayIntersect } from "../../components/box-ray-intersect";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { Velocity } from "../../components/velocity";
import { vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { deltaTime } from "@renderer/app";

const moveSpeed = 0.05;

export class PlayerControllerSystem extends System {
  keyboardControls = new KeyboardControls();
  componentsRequired = new Set([BoxRayIntersect, Transform, Velocity]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const boxRayIntersectComponent = components.get(BoxRayIntersect);
      const transformComponent = components.get(Transform);
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

      positionDelta = vec3.mulScalar(vec3.normalize(positionDelta), moveSpeed);

      animate((progress) => {
        velocityComponent.velocity = vec3.lerp(
          velocityComponent.velocity,
          positionDelta,
          progress,
        );
      });

      const playerHeight = 10.0;

      if (boxRayIntersectComponent.bottom > 0) {
        const hitDistance = boxRayIntersectComponent.bottom;
        const hitY = Math.round(transformComponent.position[1] - hitDistance);
        velocityComponent.velocity[1] = 0;
        animate(
          (progress) => {
            const targetY = hitY + playerHeight;
            const currentY = transformComponent.position[1];
            const lerpedY = currentY + (targetY - currentY) * progress;
            transformComponent.position[1] = lerpedY;
          },
          {
            easing: glide({
              velocity: 0.0002 * deltaTime,
            }),
          },
        );
      }
    }
  }
}
