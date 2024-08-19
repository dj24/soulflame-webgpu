import { Component } from "@ecs/ecs";
import { Quat, quat, Vec3, vec3 } from "wgpu-matrix";

export class FollowTarget extends Component {
  targetEntity: number;
  rotation;
  position: Vec3;
  speed = 0.01;
  constructor(
    targetEntity: number,
    position: Vec3 = vec3.zero(),
    rotation: Quat = quat.identity(),
  ) {
    super();
    this.targetEntity = targetEntity;
    this.rotation = rotation;
    this.position = position;
  }
}
