import { Component } from "@ecs/ecs";

export class TerrainChunk extends Component {
  size: number;
  position: [number, number, number];

  constructor(size: number, position: [number, number, number]) {
    super();
    this.size = size;
    this.position = position;
  }
}
