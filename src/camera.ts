import { Vector3 } from "./vector3";
import { camera, deltaTime, keyboardControls, mouseControls } from "./app";

export class Camera {
  position: Vector3;
  fieldOfView: number;
  direction: Vector3;

  constructor(fieldOfView: number) {
    this.position = new Vector3(0, 0, -5);
    this.fieldOfView = fieldOfView;
    this.direction = new Vector3(0, 0, 1);
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
  const speed = 0.005;
  const rotationSpeed = 0.0001;
  camera.rotateY(mouseControls.velocity.x * deltaTime * rotationSpeed);
  camera.rotateX(mouseControls.velocity.y * deltaTime * rotationSpeed);
  if (keyboardControls.pressed.a) {
    camera.position = camera.position = camera.position.add(
      camera.left.mul(deltaTime * speed),
    );
  }
  if (keyboardControls.pressed.d) {
    camera.position = camera.position.add(camera.right.mul(deltaTime * speed));
  }
  if (keyboardControls.pressed.w) {
    camera.position = camera.position.add(
      camera.direction.mul(deltaTime * speed),
    );
  }
  if (keyboardControls.pressed.s) {
    camera.position = camera.position.subtract(
      camera.direction.mul(deltaTime * speed),
    );
  }
  if (keyboardControls.pressed[" "]) {
    camera.position.y += deltaTime * speed;
  }
  if (keyboardControls.pressed.Control) {
    camera.position.y -= deltaTime * speed;
  }
};
