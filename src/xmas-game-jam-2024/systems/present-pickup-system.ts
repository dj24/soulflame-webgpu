import { Entity, System } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { Present } from "../components/present";
import { vec3 } from "wgpu-matrix";
import { KeyboardControls } from "@input/keyboard-controls";
import { PresentCount } from "../components/present-count";

export class PresentPickupSystem extends System {
  componentsRequired = new Set([Camera, Transform]);
  keyboardControls = new KeyboardControls();
  audio: HTMLAudioElement;

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    if (!this.audio) {
      this.audio = new Audio("./xmas-game-jam-2024/bell.wav");
      this.audio.volume = 0.1;
    }

    const camera = this.ecs
      .getEntitiesithComponent(Camera)
      .values()
      .next().value;
    if (!camera) {
      return;
    }

    const cameraTransform = this.ecs.getComponents(camera).get(Transform);
    const presentCount = this.ecs.getComponents(camera).get(PresentCount);
    const presents = this.ecs.getEntitiesithComponent(Present);

    for (const present of presents) {
      const presentTransform = this.ecs.getComponents(present).get(Transform);
      const presentPosition = presentTransform.position;
      const distance = vec3.distance(cameraTransform.position, presentPosition);
      if (distance < 20 && this.keyboardControls.pressed["e"]) {
        console.log("Picked up present");
        this.audio.play();
        this.ecs.removeEntity(present);
        presentCount.count++;
      }
    }
  }
}
