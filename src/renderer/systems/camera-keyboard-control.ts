import { System, Entity } from "@ecs/ecs";
import { Transform } from "../components/transform";
import { KeyboardControls } from "../keyboard-controls";
import { Camera } from "../components/camera";
import { quat, vec3 } from "wgpu-matrix";

export class CameraKeyboardControl extends System {
  keyboardControls = new KeyboardControls();
  componentsRequired = new Set([Camera, Transform]);
  speed = 0.5;
  rotationSpeed = 0.025;

  update(entities: Set<Entity>, now: number): void {
    if (entities.size > 1) {
      console.warn(
        "Only one camera can be controlled by the keyboard - ignoring the rest",
      );
    }
    const cameraEntity = entities.values().next().value;
    const components = this.ecs.getComponents(cameraEntity);
    const transformComponent = components.get(Transform);

    if (this.keyboardControls.pressed.a) {
      transformComponent.position = vec3.add(
        transformComponent.position,
        vec3.mulScalar(transformComponent.left, this.speed),
      );
    }
    if (this.keyboardControls.pressed.d) {
      transformComponent.position = vec3.add(
        transformComponent.position,
        vec3.mulScalar(transformComponent.right, this.speed),
      );
    }
    if (this.keyboardControls.pressed.w) {
      transformComponent.position = vec3.add(
        transformComponent.position,
        vec3.mulScalar(transformComponent.direction, this.speed),
      );
    }
    if (this.keyboardControls.pressed.s) {
      transformComponent.position = vec3.sub(
        transformComponent.position,
        vec3.mulScalar(transformComponent.direction, this.speed),
      );
    }
    if (this.keyboardControls.pressed.q) {
      transformComponent.rotation = quat.rotateY(
        transformComponent.rotation,
        -this.rotationSpeed,
      );
    }
    if (this.keyboardControls.pressed.e) {
      transformComponent.rotation = quat.rotateY(
        transformComponent.rotation,
        this.rotationSpeed,
      );
    }
    if (this.keyboardControls.pressed[" "]) {
      transformComponent.position = vec3.add(
        transformComponent.position,
        vec3.mulScalar(transformComponent.up, this.speed),
      );
    }
    if (this.keyboardControls.pressed.shift) {
      transformComponent.position = vec3.add(
        transformComponent.position,
        vec3.mulScalar(transformComponent.down, this.speed),
      );
    }
  }
}
