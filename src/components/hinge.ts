import { Component } from "@ecs/ecs";
import * as CANNON from "cannon-es";

export class Hinge extends Component {
  entity1: number;
  entity2: number;
  config: CANNON.HingeConstraintOptions;

  constructor(
    entity1: number,
    entity2: number,
    config: CANNON.HingeConstraintOptions = {},
  ) {
    super();
    this.entity1 = entity1;
    this.entity2 = entity2;
    this.config = config;
  }
}
