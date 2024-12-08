import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControls } from "@input/keyboard-controls";
import { mat4, quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { Velocity } from "../../components/velocity";
import { animate, glide } from "motion";
import { MouseControls } from "@input/mouse-controls";
import { deltaTime } from "@renderer/app";

const DAMPING = 0.01;
const ROTATION_DAMPING = 0.01;

const getQuatFromYawPitch = (yaw: number, pitch: number) => {
  const q_yaw = quat.fromAxisAngle([0, 1, 0], yaw);
  const q_pitch = quat.fromAxisAngle([1, 0, 0], pitch);
  return quat.mul(q_yaw, q_pitch);
};

export class MouseLookSystem extends System {
  mouseControls = new MouseControls();
  componentsRequired = new Set([Transform, KeyboardControllable]);
  yaw = 0;
  pitch = 0;

  constructor() {
    super();
    // document.body.addEventListener("click", () => {
    //   if (document.pointerLockElement !== document.body) {
    //     const foo = document.body.requestPointerLock();
    //   }
    // });
  }

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    // if (document.pointerLockElement !== document.body) {
    //   return;
    // }
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transformComponent = components.get(Transform);
      const controllableComponent = components.get(KeyboardControllable);

      this.yaw +=
        this.mouseControls.velocity[0] *
        deltaTime *
        controllableComponent.rotationSpeed;
      this.pitch +=
        this.mouseControls.velocity[1] *
        deltaTime *
        controllableComponent.rotationSpeed;

      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

      animate(
        (progress: number) => {
          transformComponent.rotation = quat.slerp(
            transformComponent.rotation,
            getQuatFromYawPitch(this.yaw, this.pitch),
            progress,
          );
        },
        {
          easing: glide({
            velocity: 0.0004 * deltaTime,
          }),
        },
      );
    }
  }
}
