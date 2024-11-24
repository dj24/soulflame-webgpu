import { System } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { DebugRotate } from "../components/debug-rotate";

export class DebugRotaterSystem extends System {
  componentsRequired = new Set([Transform, DebugRotate]);
  update(entities: Set<number>, now: number, deltaTime: number): void {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transform = components.get(Transform);
      const debugRotate = components.get(DebugRotate);
      const rotateY = now * debugRotate.rotationSpeed;
      transform.rotation = quat.fromEuler(0, rotateY, 0, "xyz");
      transform.position[1] = Math.sin(now / 500) * 10 + 48;
    }
  }
}
