import { Component } from "@ecs/index";

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
}
