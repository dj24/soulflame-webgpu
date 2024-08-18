import { Component } from "@ecs/ecs";

export class Sword extends Component {
  playerEntity: number;
  constructor(playerEntity: number) {
    super();
    this.playerEntity = playerEntity;
  }
}
