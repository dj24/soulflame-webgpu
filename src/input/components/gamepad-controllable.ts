import { Component } from "@ecs/ecs";

export class GamepadControllable extends Component {
  speed = 1.0;
  rotationSpeed = 0.025;
  player: number;
  constructor(player = 0, speed = 1.0, rotationSpeed = 0.025) {
    super();
    this.player = player;
    this.speed = speed;
    this.rotationSpeed = rotationSpeed;
  }
}
