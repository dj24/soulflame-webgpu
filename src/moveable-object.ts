import { mat4, quat, Quat, vec3, Vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { deltaTime } from "./app";

export class MoveableObject {
  #position: Vec3;
  #targetPosition: Vec3;
  #rotation: Quat;
  #targetRotation: Quat;
  #scale: Vec3;
  #targetScale: Vec3;
  constructor(options: { position: Vec3; rotation: Quat }) {
    this.#position = options.position;
    this.#rotation = options.rotation;
    this.#targetPosition = this.#position;
    this.#targetRotation = this.#rotation;
    this.#scale = vec3.create(1, 1, 1);
    this.#targetScale = this.#scale;
  }

  set targetPosition(position: Vec3) {
    this.#targetPosition = position;
  }

  get position() {
    return this.#position;
  }

  get targetPosition() {
    return this.#targetPosition;
  }

  set targetRotation(rotation: Quat) {
    this.#targetRotation = rotation;
  }

  get targetRotation() {
    return this.#targetRotation;
  }

  get rotation() {
    return this.#rotation;
  }

  set targetScale(scale: Vec3) {
    this.#targetScale = scale;
  }

  get targetScale() {
    return this.#targetScale;
  }

  get scale() {
    return this.#scale;
  }

  get direction() {
    // TODO: figure out why this is negative in render pass but not compute
    return vec3.transformQuat(vec3.create(0, 0, 1), this.rotation);
  }

  get right() {
    return vec3.transformQuat(vec3.create(1, 0, 0), this.rotation);
  }

  get left() {
    return vec3.transformQuat(vec3.create(-1, 0, 0), this.rotation);
  }

  get up() {
    return vec3.transformQuat(vec3.create(0, 1, 0), this.rotation);
  }

  get down() {
    return vec3.transformQuat(vec3.create(0, -1, 0), this.rotation);
  }

  get viewMatrix() {
    const eye = this.position;
    const view = mat4.lookAt(eye, vec3.add(eye, this.direction), this.up);
    return view;
  }

  get inverseViewMatrix() {
    return mat4.invert(this.viewMatrix);
  }

  update() {
    animate(
      (progress: number) => {
        this.#position = vec3.lerp(
          this.#position,
          this.#targetPosition,
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
        this.#rotation = quat.slerp(
          this.#rotation,
          this.#targetRotation,
          progress,
        );
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
    animate((progress: number) => {
      this.#scale = vec3.lerp(this.#scale, this.#targetScale, progress);
    });
  }
}
