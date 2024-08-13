import { UpdatedByRenderLoop } from "../decorators/updated-by-render-loop";
import { quat, Quat, vec3, Vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { deltaTime } from "../app";

interface Animated<T> extends UpdatedByRenderLoop {
  value: T;
  target: T;
  update(): void;
}

@UpdatedByRenderLoop.register
export class Vec3Animation implements Animated<Vec3> {
  value;
  target;

  constructor(value: Vec3) {
    this.value = value;
    this.target = value;
  }

  update() {
    animate(
      (progress: number) => {
        this.value = vec3.lerp(this.value, this.target, progress);
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}

@UpdatedByRenderLoop.register
export class NumberAnimation implements Animated<number> {
  value: number;
  target: number;

  constructor(value: number) {
    this.value = value;
    this.target = value;
  }

  update() {
    animate(
      (progress: number) => {
        this.value = this.value + (this.target - this.value) * progress;
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}

@UpdatedByRenderLoop.register
export class QuatAnimation implements Animated<Quat> {
  value: Quat;
  target: Quat;

  constructor(value: Quat) {
    this.value = value;
    this.target = value;
  }

  update() {
    animate(
      (progress: number) => {
        this.value = quat.slerp(this.value, this.target, progress);
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}
