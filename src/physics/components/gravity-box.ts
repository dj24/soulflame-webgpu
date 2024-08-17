import { Vec3 } from "wgpu-matrix";
import { Component } from "@ecs/ecs";
import * as CANNON from "cannon-es";

export class GravityBox extends Component {
  body: CANNON.Body;

  constructor(size: Vec3) {
    super();
    this.body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(
        new CANNON.Vec3(size[0] * 10, size[1] * 10, size[2] * 10),
      ),
    });
  }
}
