import { Component } from "@ecs/index";
import { mat4, Mat4, Quat, vec3, Vec3 } from "wgpu-matrix";

export class Transform extends Component {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  #previousTransform: Mat4;

  constructor(position: Vec3, rotation: Quat, scale: Vec3) {
    super();
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.#previousTransform = mat4.identity();
  }

  get transform() {
    let m = mat4.identity();
    mat4.translate(m, this.position, m);
    mat4.scale(m, this.scale, m);
    mat4.multiply(m, mat4.fromQuat(this.rotation), m);
    return m;
  }

  get previousTransform() {
    return this.#previousTransform;
  }

  set previousTransform(value: Mat4) {
    this.#previousTransform = value;
  }

  get direction() {
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
}
