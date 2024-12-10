import { Entity, System } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { CharacterCollider } from "../components/character-collider";

export class CharacterCollisionSystem extends System {
  componentsRequired = new Set([CharacterCollider, Transform]);

  update(entities: Set<Entity>, now: number, deltaTime: number) {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const transform = components.get(Transform);
      const collider = components.get(CharacterCollider);

      // Do collision detection here
    }
  }
}
