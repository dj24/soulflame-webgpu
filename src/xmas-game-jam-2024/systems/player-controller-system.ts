import { Component, Entity, System } from "@ecs/ecs";
import { BoxRayIntersect } from "../../components/box-ray-intersect";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { Velocity } from "../../components/velocity";
import { quat, vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { deltaTime } from "@renderer/app";
import { PitchYaw } from "../components/pitch-yaw";

const moveSpeed = 0.045;

export class PlayerControllerSystem extends System {
  keyboardControls = new KeyboardControls();
  componentsRequired = new Set([
    BoxRayIntersect,
    Transform,
    Velocity,
    PitchYaw,
  ]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const boxRayIntersectComponent = components.get(BoxRayIntersect);
      const transformComponent = components.get(Transform);
      const velocityComponent = components.get(Velocity);
      const pitchYaw = components.get(PitchYaw);

      let positionDelta = vec3.create();
      const playerRadius = 20;
      const rotation = quat.fromEuler(0, pitchYaw.yaw, 0, "xyz");

      const canMoveLeft =
        boxRayIntersectComponent.left > playerRadius ||
        boxRayIntersectComponent.left === 0;
      const canMoveRight =
        boxRayIntersectComponent.right > playerRadius ||
        boxRayIntersectComponent.right === 0;
      const canMoveFront =
        boxRayIntersectComponent.front > playerRadius ||
        boxRayIntersectComponent.front === 0;
      const canMoveBack =
        boxRayIntersectComponent.back > playerRadius ||
        boxRayIntersectComponent.back === 0;

      if (this.keyboardControls.pressed.a && canMoveLeft) {
        const direction = vec3.transformQuat([-1, 0, 0], rotation);
        positionDelta = vec3.add(positionDelta, direction);
      }
      if (this.keyboardControls.pressed.d && canMoveRight) {
        const direction = vec3.transformQuat([1, 0, 0], rotation);
        positionDelta = vec3.add(positionDelta, direction);
      }
      if (this.keyboardControls.pressed.w && canMoveFront) {
        const direction = vec3.transformQuat([0, 0, 1], rotation);
        positionDelta = vec3.add(positionDelta, direction);
      }
      if (this.keyboardControls.pressed.s && canMoveBack) {
        const direction = vec3.transformQuat([0, 0, -1], rotation);
        positionDelta = vec3.add(positionDelta, direction);
      }

      positionDelta = vec3.mulScalar(vec3.normalize(positionDelta), moveSpeed);

      animate((progress) => {
        velocityComponent.velocity = vec3.lerp(
          velocityComponent.velocity,
          positionDelta,
          progress,
        );
        velocityComponent.velocity[1] = 0;
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
      } else {
        velocityComponent.velocity[1] += 0.01 * deltaTime;
      }
    }
  }
}
