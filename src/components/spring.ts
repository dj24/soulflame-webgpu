import { Component } from "@ecs/ecs";
import * as CANNON from "cannon-es";

export class Spring extends Component {
  entity1: number;
  entity2: number;
  pivot1: CANNON.Vec3;
  pivot2: CANNON.Vec3;
  config: CANNON.SpringOptions;

  constructor(
    entity1: number,
    entity2: number,
    pivot1: CANNON.Vec3,
    pivot2: CANNON.Vec3,
    config: CANNON.SpringOptions = {},
  ) {
    super();
    this.entity1 = entity1;
    this.entity2 = entity2;
    this.pivot1 = pivot1;
    this.pivot2 = pivot2;
    this.config = config;
  }
}
