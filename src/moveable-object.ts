import { Mat4, mat4, quat, Quat, vec3, Vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { deltaTime } from "./app";

interface UpdatedByRenderLoop {
  update(): void;
}

interface Animateable<T> extends UpdatedByRenderLoop {
  value: T;
  target: T;
}

export class Vec3Animation implements Animateable<Vec3> {
  #value;
  #target;

  constructor(value: Vec3, target: Vec3) {
    this.#value = value;
    this.#target = target;
  }

  get value() {
    return this.#value;
  }

  set target(target: Vec3) {
    this.#target = target;
  }

  get target() {
    return this.#target;
  }

  update() {
    animate(
      (progress: number) => {
        this.#value = vec3.lerp(this.#value, this.#target, progress);
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}

export class QuatAnimation implements Animateable<Quat> {
  #value: Quat;
  #target: Quat;

  constructor(value: Quat, target: Quat) {
    this.#value = value;
    this.#target = target;
  }

  get value() {
    return this.#value;
  }

  set target(target: Quat) {
    this.#target = target;
  }

  get target() {
    return this.#target;
  }

  update() {
    animate(
      (progress: number) => {
        this.#value = quat.slerp(this.#value, this.#target, progress);
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}

export class MoveableObject implements UpdatedByRenderLoop {
  #position: Vec3Animation;
  #rotation: QuatAnimation;
  #scale: Vec3;
  #targetScale: Vec3;
  #previousTransform: Mat4;

  constructor(options: { position: Vec3; rotation: Quat; scale?: Vec3 }) {
    this.#position = new Vec3Animation(options.position, options.position);
    this.#rotation = new QuatAnimation(options.rotation, options.rotation);
    this.#scale = options.scale ?? vec3.create(1, 1, 1);
    this.#targetScale = this.#scale;
    this.#previousTransform = this.transform;
  }

  get transform() {
    let m = mat4.identity();
    mat4.translate(m, this.#position.value, m);
    mat4.scale(m, this.#scale, m);
    mat4.multiply(m, mat4.fromQuat(this.#rotation.value), m);
    return m;
  }

  get previousTransform() {
    return this.#previousTransform;
  }

  get inverseTransform() {
    return mat4.invert(this.transform);
  }

  get previousInverseTransform() {
    return mat4.invert(this.#previousTransform);
  }

  set targetPosition(position: Vec3) {
    this.#position.target = position;
  }

  get position() {
    return this.#position;
  }

  get targetPosition() {
    return this.#position.target;
  }

  set targetRotation(rotation: Quat) {
    this.#rotation.target = rotation;
  }

  get targetRotation() {
    return this.#rotation.target;
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
    return vec3.transformQuat(vec3.create(0, 0, 1), this.rotation.value);
  }

  get right() {
    return vec3.transformQuat(vec3.create(1, 0, 0), this.rotation.value);
  }

  get left() {
    return vec3.transformQuat(vec3.create(-1, 0, 0), this.rotation.value);
  }

  get up() {
    return vec3.transformQuat(vec3.create(0, 1, 0), this.rotation.value);
  }

  get down() {
    return vec3.transformQuat(vec3.create(0, -1, 0), this.rotation.value);
  }

  get viewMatrix() {
    const eye = this.position.value;
    return mat4.lookAt(eye, vec3.add(eye, this.direction), this.up);
  }

  get inverseViewMatrix() {
    return mat4.invert(this.viewMatrix);
  }

  update() {
    this.#position.update();
    this.#rotation.update();
    animate((progress: number) => {
      this.#scale = vec3.lerp(this.#scale, this.#targetScale, progress);
    });
    this.#previousTransform = this.transform;
  }
}
