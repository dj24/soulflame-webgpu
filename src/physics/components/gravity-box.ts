import { Vec3 } from "wgpu-matrix";
import { Component } from "@ecs/ecs";
import * as CANNON from "cannon-es";

export class GravityBox extends Component {
  body: CANNON.Body;
  halfExtents: CANNON.Vec3;

  constructor(size: Vec3) {
    super();

    // TOOD: account for object scale here
    this.halfExtents = new CANNON.Vec3(size[0] * 1, size[1] * 1, size[2] * 1);
    console.log(this.halfExtents);
    this.body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(this.halfExtents),
    });
  }
}
