import { Component } from "@ecs/ecs";
import { mat4 } from "wgpu-matrix";
import { resolution } from "@renderer/app";

export class Camera extends Component {
  fieldOfView: number;
  near = 0.5;
  far = 10000;

  constructor(fieldOfView: number, near: number, far: number) {
    super();
    this.fieldOfView = fieldOfView;
    this.near = near;
    this.far = far;
  }

  get projectionMatrix() {
    return mat4.perspective(
      this.fieldOfView,
      resolution[0] / resolution[1],
      this.near,
      this.far,
    );
  }
}
