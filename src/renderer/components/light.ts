import { Component } from "../../ecs";
import { Vec3 } from "wgpu-matrix";

export class Light extends Component {
  color: Vec3;
  constructor(color: Vec3) {
    super();
    this.color = color;
  }
}
