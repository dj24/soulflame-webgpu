import { Component } from "@ecs/ecs";
import { Vec3 } from "wgpu-matrix";
import * as CANNON from "cannon-es";

export class ImmovableBox extends Component {
  body: CANNON.Body;
  halfExtents: CANNON.Vec3;

  constructor(size: Vec3) {
    super();
    this.halfExtents = new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2);
    this.body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(this.halfExtents),
    });
  }
}
