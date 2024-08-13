import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame } from "@renderer/app";

export class Renderer extends System {
  componentsRequired = new Set([Camera, Transform]);

  update(entities: Set<Entity>, now: number): void {
    if (entities.size > 1) {
      console.warn("Only one camera can be rendered - ignoring the rest");
    }
    const cameraEntity = entities.values().next().value;
    const components = this.ecs.getComponents(cameraEntity);
    const cameraComponent = components.get(Camera);
    const transformComponent = components.get(Transform);
    frame(now, cameraComponent, transformComponent);
  }
}
