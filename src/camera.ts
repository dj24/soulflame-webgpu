import { Vector3 } from "./vector3";

export class Camera {
  position: Vector3;
  fieldOfView: number;
  direction: Vector3;

  constructor(fieldOfView: number) {
    this.position = new Vector3(0, 0, -5);
    this.fieldOfView = fieldOfView;
    this.direction = new Vector3(0, 0, 1);
  }
}
