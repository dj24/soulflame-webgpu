import { Vec3 } from "wgpu-matrix";
import { Component } from "@ecs/ecs";
import * as CANNON from "cannon-es";

export class GravityBox extends Component {
  body: CANNON.Body;
  halfExtents: CANNON.Vec3;

  constructor(size: Vec3) {
    super();
    // TOOD: account for object scale here
    this.halfExtents = new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2);
    this.body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(this.halfExtents),
    });
  }
}
