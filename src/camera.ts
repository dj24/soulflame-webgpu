import { camera, deltaTime, frameCount, resolution } from "./app";
import { KeyboardControls } from "./keyboard-controls";
import { MouseControls } from "./mouse-controls";
import { MoveableObject } from "./moveable-object";
import { mat4, quat, Quat, vec3, Vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { haltonJitter } from "./jitter-view-projection";

const keyboardControls = new KeyboardControls();
// const mouseControls = new MouseControls();

export class Camera extends MoveableObject {
  fieldOfView: number;
  near = 0.1;
  far = 10000;

  constructor(options: {
    position: Vec3;
    fieldOfView: number;
    direction: Vec3;
  }) {
    super({ position: options.position, rotation: quat.identity() });
    this.fieldOfView = options.fieldOfView;
  }

  get direction() {
    return vec3.transformQuat(vec3.create(0, 0, 1), this.rotation);
  }

  get right() {
    return vec3.transformQuat(vec3.create(1, 0, 0), this.rotation);
  }

  get left() {
    return vec3.transformQuat(vec3.create(-1, 0, 0), this.rotation);
  }

  get up() {
    return vec3.transformQuat(vec3.create(0, 1, 0), this.rotation);
  }

  get down() {
    return vec3.transformQuat(vec3.create(0, -1, 0), this.rotation);
  }

  get viewMatrix() {
    const target = vec3.add(this.position, this.direction);
    const view = mat4.lookAt(this.position, target, this.up);
    return haltonJitter(frameCount, view);
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
  const rotationSpeed = 0.0001;
  // TODO: abstract this
  // camera.rotateY(-mouseControls.velocity[0] * rotationSpeed);
  // camera.rotateX(mouseControls.velocity[1] * rotationSpeed);
  // console.log(mouseControls.velocity);
  // if (!document.hasFocus()) {
  //   return;
  // }
  const speed = 0.03 * deltaTime;
  let direction = vec3.zero();
  // TODO: Why is it backwards?
  if (keyboardControls.pressed.a) {
    direction = vec3.add(direction, camera.left);
  }
  if (keyboardControls.pressed.d) {
    direction = vec3.add(direction, camera.right);
  }
  if (keyboardControls.pressed.w) {
    direction = vec3.add(direction, camera.direction);
  }
  if (keyboardControls.pressed.s) {
    direction = vec3.subtract(direction, camera.direction);
  }
  if (keyboardControls.pressed[" "]) {
    direction = vec3.add(direction, camera.down);
  }
  if (keyboardControls.pressed.control) {
    direction = vec3.add(direction, camera.up);
  }
  direction = vec3.normalize(direction);
  camera.targetPosition = vec3.add(
    camera.targetPosition,
    vec3.mulScalar(direction, speed),
  );
  // camera.targetRotation = quat.fromEuler(
  //   // Math.sin(performance.now() * 0.0005) * 0.5 + 0.5,
  //   0,
  //   performance.now() * 0.0001,
  //   0,
  //   "xyz",
  // );
};
