import { camera, deltaTime } from "./app";
import { quat, Quat, vec3, Vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { haltonSequence } from "./halton-sequence";
import { haltonJitter } from "./jitter-view-projection";

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

  getJitteredPosition(frameNumber: number): Vec3 {
    const haltonOffset = haltonJitter(frameNumber);
    const right = vec3.mulScalar(camera.right, haltonOffset[0]);
    const up = vec3.mulScalar(camera.up, haltonOffset[1]);
    return vec3.add(vec3.add(this.position, right), up);
  }
}
