import { Vector3 } from "./vector3";
import { camera, deltaTime } from "./app";
import { KeyboardControls } from "./keyboard-controls";
import { MouseControls } from "./mouse-controls";
import { MoveableObject } from "./moveable-object";

// const keyboardControls = new KeyboardControls();
// const mouseControls = new MouseControls();

export class Camera extends MoveableObject {
  fieldOfView: number;
  direction: Vector3;

  constructor(options: { position: Vector3; fieldOfView: number, direction: Vector3 }) {
    super({ position: options.position });
    this.fieldOfView = options.fieldOfView;
    this.direction = options.direction;
  }

  get right() {
    return Vector3.up.cross(this.direction).normalize();
  }

  get left() {
    return this.direction.cross(Vector3.up).normalize();
  }

  get up() {
    return this.direction.cross(this.right).normalize();
  }

  get down() {
    return this.up.negate();
  }

  rotateX(angle: number) {
    this.direction = this.direction.rotateAroundAxis(this.right, angle);
  }

  rotateY(angle: number) {
    this.direction = this.direction.rotateAroundAxis(Vector3.up, angle);
  }
}

export const moveCamera = () => {
  const rotationSpeed = 0.001;
  // TODO: abstract this
  // camera.rotateY(mouseControls.velocity.x * rotationSpeed);
  // camera.rotateX(mouseControls.velocity.y * rotationSpeed);
  if (!document.hasFocus()) {
    return;
  }
  const speed = 0.01;
  let direction = Vector3.zero;
  // if (keyboardControls.pressed.a) {
  //   direction = direction.add(camera.left);
  // }
  // if (keyboardControls.pressed.d) {
  //   direction = direction.add(camera.right);
  // }
  // if (keyboardControls.pressed.w) {
  //   direction = direction.add(camera.direction);
  // }
  // if (keyboardControls.pressed.s) {
  //   direction = direction.subtract(camera.direction);
  // }
  // if (keyboardControls.pressed[" "]) {
  //   direction = direction.add(camera.up);
  // }
  // if (keyboardControls.pressed.Control) {
  //   direction = direction.add(camera.down);
  // }
  direction = direction.normalize();
  camera.velocity = camera.velocity.add(direction.mul(speed));
};
