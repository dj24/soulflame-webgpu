import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { mat4, quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { Velocity } from "../../components/velocity";
import { animate, glide } from "motion";
import { MouseControls } from "@input/mouse-controls";

const DAMPING = 0.01;
const ROTATION_DAMPING = 0.01;

export class MouseLookSystem extends System {
  mouseControls = new MouseControls();
  componentsRequired = new Set([Transform, KeyboardControllable, Velocity]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transformComponent = components.get(Transform);
      const controllableComponent = components.get(KeyboardControllable);
      const velocityComponent = components.get(Velocity);
      let rotationDelta = quat.identity();

      console.log(this.mouseControls.velocity[0]);

      // rotationDelta = quat.rotateY(
      //   rotationDelta,
      //   controllableComponent.rotationSpeed *
      //     deltaTime *
      //     this.mouseControls.velocity[0],
      // );

      rotationDelta = quat.rotateX(
        rotationDelta,
        controllableComponent.rotationSpeed *
          deltaTime *
          this.mouseControls.velocity[1],
      );

      velocityComponent.angularVelocity = rotationDelta;
    }
  }
}
