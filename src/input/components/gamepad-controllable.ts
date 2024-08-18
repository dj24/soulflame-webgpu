import { Component } from "@ecs/ecs";

export class GamepadControllable extends Component {
  speed = 1000.0;
  rotationSpeed = 0.0255;
  player = 0;
}
