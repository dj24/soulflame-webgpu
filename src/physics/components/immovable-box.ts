import { Component } from "@ecs/ecs";
import { Vec3 } from "wgpu-matrix";
import * as CANNON from "cannon-es";

export class ImmovableBox extends Component {
  bodyId: number;
  halfExtents: CANNON.Vec3;

  constructor(size: Vec3) {
    super();
    this.halfExtents = new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2);
  }
}