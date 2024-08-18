import { Vec3 } from "wgpu-matrix";
import { Component } from "@ecs/ecs";
import * as CANNON from "cannon-es";

export class GravityBox extends Component {
  bodyId: number;
  halfExtents: CANNON.Vec3;
  mass: number;
  angularFactor: CANNON.Vec3;

  constructor(size: Vec3, mass = 1, angularFactor = new CANNON.Vec3(1, 1, 1)) {
    super();
    this.halfExtents = new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2);
    this.mass = mass;
    this.angularFactor = angularFactor;
  }
}
