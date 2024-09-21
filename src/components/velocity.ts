import { quat, vec3 } from "wgpu-matrix";
import { Component } from "@ecs/ecs";

export class Velocity extends Component {
  velocity = vec3.create();
  angularVelocity = quat.identity();
}
