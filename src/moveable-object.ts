import { camera, deltaTime } from "./app";
import { vec3, Vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";

const SMOOTH_TIME = 200.0;

export class MoveableObject {
  position: Vec3;
  targetPosition: Vec3;
  constructor(options: { position: Vec3 }) {
    this.position = options.position;
    this.targetPosition = this.position;
  }

  update() {
    animate(
      (progress: number) => {
        this.position = vec3.add(
          this.position,
          vec3.mulScalar(
            vec3.subtract(this.targetPosition, this.position),
            progress,
          ),
        );
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}
