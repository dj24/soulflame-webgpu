import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { animate, glide } from "motion";
import { MouseControls } from "@input/mouse-controls";
import { PitchYaw } from "../../xmas-game-jam-2024/components/pitch-yaw";

const getQuatFromYawPitch = (yaw: number, pitch: number) => {
  const q_yaw = quat.fromAxisAngle([0, 1, 0], yaw);
  const q_pitch = quat.fromAxisAngle([1, 0, 0], pitch);
  return quat.mul(q_yaw, q_pitch);
};

export class MouseLookSystem extends System {
  mouseControls = new MouseControls();
  componentsRequired = new Set([Transform, KeyboardControllable, PitchYaw]);

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
      const pitchYaw = components.get(PitchYaw);

      pitchYaw.yaw +=
        this.mouseControls.velocity[0] *
        deltaTime *
        controllableComponent.rotationSpeed;
      pitchYaw.pitch +=
        this.mouseControls.velocity[1] *
        deltaTime *
        controllableComponent.rotationSpeed;

      pitchYaw.pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, pitchYaw.pitch),
      );

      animate(
        (progress: number) => {
          transformComponent.rotation = quat.slerp(
            transformComponent.rotation,
            getQuatFromYawPitch(pitchYaw.yaw, pitchYaw.pitch),
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
