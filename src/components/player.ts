import { Component } from "@ecs/ecs";

export class Player extends Component {
  health = 100;
  maxHealth = 100;
  swordEntity: number;
  constructor(swordEntity: number) {
    super();
    this.swordEntity = swordEntity;
  }
}
