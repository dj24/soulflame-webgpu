import { Component } from "@ecs/ecs";

export class Bomb extends Component {
  timer: number;
  constructor(timer = 2) {
    super();
    this.timer = timer;
  }
}
