import { Component } from "@ecs/index";
import { Quat, Vec3 } from "wgpu-matrix";

export class Transform extends Component {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;

  constructor(position: Vec3, rotation: Quat, scale: Vec3) {
    super();
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
  }
}
