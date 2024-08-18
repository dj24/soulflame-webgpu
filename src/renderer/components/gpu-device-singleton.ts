import { Component } from "@ecs/ecs";
import { VolumeAtlas } from "@renderer/volume-atlas";

export class GPUDeviceSingleton extends Component {
  device: GPUDevice;
  volumeAtlas: VolumeAtlas;
}
