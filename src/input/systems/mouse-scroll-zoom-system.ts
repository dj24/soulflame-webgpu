import { System, Entity } from "@ecs/ecs";
import { KeyboardControls } from "@input/keyboard-controls";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { Camera } from "@renderer/components/camera";
import { animate, glide } from "motion";
import { deltaTime } from "@renderer/app";

const DAMPING = 0.01;
const ROTATION_DAMPING = 0.01;

export class MouseScrollZoomSystem extends System {
  isInitialized = false;
  componentsRequired = new Set([Camera, KeyboardControllable]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    if (this.isInitialized) {
      return;
    }
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const camera = components.get(Camera);
      window.addEventListener("wheel", (event) => {
        if ("size" in camera.config) {
          return;
        }
        let currentFieldOfView = camera.config.fieldOfView;
        let targetFieldOfView = currentFieldOfView + event.deltaY * 0.000005;
        camera.config.fieldOfView = targetFieldOfView;
      });
    }
  }
}
