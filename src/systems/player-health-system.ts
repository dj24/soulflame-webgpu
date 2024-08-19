import { Player } from "../components/player";
import { Entity, System } from "@ecs/ecs";
import { GravityBox } from "@physics/components/gravity-box";
import { getPhysicsWorld } from "../abstractions/get-physics-world";

export class PlayerHealthSystem extends System {
  componentsRequired = new Set([Player, GravityBox]);
  addedEvents = new Map<Entity, Function>();

  constructor() {
    super();
  }
  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    const physicsWorld = getPhysicsWorld(this.ecs);
    for (const entity of entities) {
      if (!this.addedEvents.has(entity)) {
        const handler = (event: any) => {
          const { bodyId } = event.detail;
          const components = this.ecs.getComponents(entity);
          const player = components.get(Player);
          const gravityBox = components.get(GravityBox);

          if (bodyId === gravityBox.bodyId) {
            player.health -= 1;
            console.log("Player health:", player.health);
          }
        };
        document.addEventListener("player-damaged", handler);
      }
    }
  }
}
