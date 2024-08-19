import { Component } from "@ecs/ecs";

export class Sword extends Component {
  playerEntity: number;
  bodyId: number;
  constructor(playerEntity: number) {
    super();
    this.playerEntity = playerEntity;
  }
}
