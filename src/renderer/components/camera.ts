import { Component } from "@ecs/ecs";
import { mat4 } from "wgpu-matrix";
import { resolution } from "@renderer/app";

type PersectiveCameraConfig = {
  fieldOfView: number;
  near: number;
  far: number;
};

type OrthographicCameraConfig = {
  size: number;
};

type CameraConfig = PersectiveCameraConfig | OrthographicCameraConfig;

export class Camera extends Component {
  config: CameraConfig;

  constructor(config: CameraConfig) {
    super();
    this.config = config;
  }

  get projectionMatrix() {
    if ("size" in this.config) {
      return mat4.ortho(
        -resolution[0] / this.config.size,
        resolution[0] / this.config.size,
        -resolution[1] / this.config.size,
        resolution[1] / this.config.size,
        this.config.size,
        -this.config.size,
      );
    }
    return mat4.perspective(
      this.config.fieldOfView,
      resolution[0] / resolution[1],
      this.config.near,
      this.config.far,
    );
  }
}
