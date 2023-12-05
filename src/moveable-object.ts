import { camera, deltaTime } from "./app";
import { vec3, Vec3 } from "wgpu-matrix";

const SMOOTH_TIME = 200.0;

export class MoveableObject {
  position: Vec3;
  targetPosition: Vec3;
  velocity: Vec3;
  constructor(options: { position: Vec3 }) {
    this.position = options.position;
    this.targetPosition = this.position;
    this.velocity = vec3.zero();
  }

  update() {
    camera.velocity = vec3.mulScalar(camera.velocity, 1 - deltaTime * 0.015);
    this.position = vec3.add(
      this.position,
      vec3.mulScalar(this.velocity, deltaTime),
    );
  }
}
