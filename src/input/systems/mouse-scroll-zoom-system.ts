import { System, Entity } from "@ecs/ecs";
import { KeyboardControls } from "@input/keyboard-controls";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { Camera } from "@renderer/components/camera";

const DAMPING = 0.01;
const ROTATION_DAMPING = 0.01;

export class KeyboardControl extends System {
  keyboardControls = new KeyboardControls();
  componentsRequired = new Set([Camera, KeyboardControllable]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const camera = components.get(Camera);
    }
  }
}
