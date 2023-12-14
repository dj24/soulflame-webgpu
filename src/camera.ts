import { camera, deltaTime, resolution } from "./app";
import { KeyboardControls } from "./keyboard-controls";
import { MouseControls } from "./mouse-controls";
import { MoveableObject } from "./moveable-object";
import { mat4, vec3, Vec3 } from "wgpu-matrix";

const keyboardControls = new KeyboardControls();
// const mouseControls = new MouseControls();

export class Camera extends MoveableObject {
  fieldOfView: number;
  direction: Vec3;
  near = 0.1;
  far = 100000;

  constructor(options: {
    position: Vec3;
    fieldOfView: number;
    direction: Vec3;
  }) {
    super({ position: options.position });
    this.fieldOfView = options.fieldOfView;
    this.direction = options.direction;
  }

  get right() {
    return vec3.normalize(vec3.cross(vec3.create(0, 1, 0), this.direction));
  }

  get left() {
    return vec3.negate(this.right);
    // return this.direction.cross(Vector3.up).normalize();
  }

  get up() {
    return vec3.normalize(vec3.cross(this.direction, this.right));
  }

  get down() {
    return vec3.negate(this.up);
  }

  rotateX(angle: number) {}

  rotateY(angle: number) {}

  get viewMatrix() {
    const target = vec3.add(this.position, this.direction);
    return mat4.lookAt(this.position, target, this.up);
  }

  get inverseViewMatrix() {
    return mat4.invert(this.viewMatrix);
  }

  get perspectiveMatrix() {
    return mat4.perspective(
      this.fieldOfView,
      resolution[0] / resolution[1],
      this.near,
      this.far,
    );
  }

  get projectionMatrix() {
    return mat4.multiply(this.perspectiveMatrix, this.viewMatrix);
  }

  get inverseProjectionMatrix() {
    return mat4.invert(this.projectionMatrix);
  }

  get viewProjectionMatrix() {
    return mat4.mul(this.projectionMatrix, this.viewMatrix);
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
  const speed = 0.75;
  let direction = vec3.zero();
  // TODO: Why is it backwards?
  if (keyboardControls.pressed.a) {
    direction = vec3.add(direction, camera.right);
  }
  if (keyboardControls.pressed.d) {
    direction = vec3.add(direction, camera.left);
  }
  if (keyboardControls.pressed.w) {
    direction = vec3.add(direction, camera.direction);
  }
  if (keyboardControls.pressed.s) {
    direction = vec3.subtract(direction, camera.direction);
  }
  if (keyboardControls.pressed[" "]) {
    direction = vec3.add(direction, camera.up);
  }
  if (keyboardControls.pressed.control) {
    direction = vec3.add(direction, camera.down);
  }
  direction = vec3.normalize(direction);
  camera.velocity = vec3.mulScalar(direction, speed);
};
