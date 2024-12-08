import { Component } from "@ecs/ecs";

export class GlobalAudioSource extends Component {
  volume: number;
  path: string;

  constructor(path: string, volume = 1) {
    super();
    this.path = path;
    this.volume = volume;
  }
}
