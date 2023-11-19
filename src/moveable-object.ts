import { smoothDampVector3 } from "./smooth-damp";
import { Vector3 } from "./vector3";
import { camera, deltaTime } from "./app";

const SMOOTH_TIME = 200.0;

export class MoveableObject {
  position: Vector3;
  targetPosition: Vector3;
  velocity: Vector3;
  constructor(options: { position: Vector3 }) {
    this.position = options.position;
    this.targetPosition = this.position;
    this.velocity = Vector3.zero;
  }

  update() {
    camera.velocity = camera.velocity.mul(1 - deltaTime * 0.015);
    this.position = this.position.add(this.velocity.mul(deltaTime));
  }
}
