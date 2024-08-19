import { Component } from "@ecs/ecs";
import { VoxelObject } from "@renderer/voxel-object";

export class Spawner extends Component {
  voxelObjects: VoxelObject[];
  constructor(voxelObjects: VoxelObject[]) {
    super();
    this.voxelObjects = voxelObjects;
  }
}
