import { Component, Entity } from "@ecs/ecs";

export class TerrainSingleton extends Component {
  chunkMap: Map<string, Entity> = new Map();
}
