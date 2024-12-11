import { Transform } from "@renderer/components/transform";
import { Entity, System } from "@ecs/ecs";

export class UpdatePreviousTransforms extends System {
  componentsRequired = new Set([Transform]);

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transform = components.get(Transform);
      setTimeout(() => {
        transform.previousTransform = transform.transform;
      });
    }
  }
}
