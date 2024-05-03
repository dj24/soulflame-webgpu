import { Mat4, mat4, Quat, vec3, Vec3 } from "wgpu-matrix";
import { QuatAnimation, Vec3Animation } from "./abstractions/animation";

export class MovableObject {
  position: Vec3Animation;
  rotation: QuatAnimation;
  scale: Vec3Animation;
  #previousTransform: Mat4;

  constructor(options: { position: Vec3; rotation: Quat; scale?: Vec3 }) {
    this.position = new Vec3Animation(options.position);
    this.rotation = new QuatAnimation(options.rotation);
    this.scale = new Vec3Animation(options.scale ?? vec3.create(1, 1, 1));
    this.#previousTransform = this.transform;
  }

  get transform() {
    let m = mat4.identity();
    mat4.translate(m, this.position.value, m);
    mat4.scale(m, this.scale.value, m);
    mat4.multiply(m, mat4.fromQuat(this.rotation.value), m);
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
    this.position.target = position;
  }

  get targetPosition() {
    return this.position.target;
  }

  set targetRotation(rotation: Quat) {
    this.rotation.target = rotation;
  }

  get targetRotation() {
    return this.rotation.target;
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
}
