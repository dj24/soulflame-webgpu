import { Entity, System } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { Velocity } from "../components/velocity";
import { quat, vec3 } from "wgpu-matrix";

export class VelocitySystem extends System {
  componentsRequired = new Set([Transform, Velocity]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transformComponent = components.get(Transform);
      const velocityComponent = components.get(Velocity);

      const positionDelta = vec3.mulScalar(
        velocityComponent.velocity,
        deltaTime,
      );

      transformComponent.position = vec3.add(
        transformComponent.position,
        positionDelta,
      );

      transformComponent.rotation = quat.mul(
        transformComponent.rotation,
        velocityComponent.angularVelocity,
      );
    }
  }
}
