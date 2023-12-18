import { camera, deltaTime } from "./app";
import { quat, Quat, vec3, Vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";

export class MoveableObject {
  position: Vec3;
  targetPosition: Vec3;
  rotation: Quat;
  targetRotation: Quat;
  scale: Vec3;
  targetScale: Vec3;
  constructor(options: { position: Vec3; rotation: Quat }) {
    this.position = options.position;
    this.rotation = options.rotation;
    this.targetPosition = this.position;
    this.targetRotation = this.rotation;
    this.scale = vec3.create(1, 1, 1);
    this.targetScale = this.scale;
  }

  update() {
    animate(
      (progress: number) => {
        this.position = vec3.lerp(this.position, this.targetPosition, progress);
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
    animate(
      (progress: number) => {
        this.rotation = quat.slerp(
          this.rotation,
          this.targetRotation,
          progress,
        );
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
    animate(
      (progress: number) => {
        this.scale = vec3.lerp(this.scale, this.targetScale, progress);
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}
