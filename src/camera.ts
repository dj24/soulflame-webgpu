import { camera, deltaTime, frameCount, resolution } from "./app";
import { KeyboardControls } from "./keyboard-controls";
import { MovableObject } from "./movable-object";
import { mat4, quat, vec3, Vec3 } from "wgpu-matrix";
import { UpdatedByRenderLoop } from "./decorators/updated-by-render-loop";
import { haltonJitter } from "./jitter-view-projection";

const keyboardControls = new KeyboardControls();

@UpdatedByRenderLoop.register
export class Camera extends MovableObject {
  fieldOfView: number;
  near = 0.5;
  far = 10000;

  constructor(options: {
    position: Vec3;
    fieldOfView: number;
    direction: Vec3;
  }) {
    super({
      position: options.position,
      rotation: quat.fromMat(
        mat4.lookAt(vec3.create(), options.direction, vec3.create(0, 1, 0)),
      ),
    });
    this.fieldOfView = options.fieldOfView;
  }

  get projectionMatrix() {
    return mat4.perspective(
      this.fieldOfView,
      resolution[0] / resolution[1],
      this.near,
      this.far,
    );
  }

  get inverseProjectionMatrix() {
    return mat4.invert(this.projectionMatrix);
  }

  get viewProjectionMatrix() {
    const jitteredViewMatrix = haltonJitter(frameCount, this.viewMatrix);
    return mat4.mul(this.projectionMatrix, jitteredViewMatrix);
  }

  get inverseViewProjectionMatrix() {
    return mat4.invert(this.viewProjectionMatrix);
  }

  update() {
    const rotationSpeed = 0.005 * deltaTime;
    const speed = 0.04 * deltaTime;
    let direction = vec3.zero();
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
    if (keyboardControls.pressed.e) {
      camera.targetRotation = quat.rotateY(
        camera.targetRotation,
        rotationSpeed,
      );
    }
    if (keyboardControls.pressed.q) {
      camera.targetRotation = quat.rotateY(
        camera.targetRotation,
        -rotationSpeed,
      );
    }
    if (keyboardControls.pressed[" "]) {
      direction = vec3.add(direction, camera.up);
    }
    if (keyboardControls.pressed.shift) {
      direction = vec3.add(direction, camera.down);
    }
    direction = vec3.normalize(direction);
    camera.targetPosition = vec3.add(
      camera.targetPosition,
      vec3.mulScalar(direction, speed),
    );
  }
}
