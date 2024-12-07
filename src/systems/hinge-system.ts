import { Entity, System } from "@ecs/ecs";
import { GravityBox } from "@physics/components/gravity-box";
import * as CANNON from "cannon-es";
import { getPhysicsWorld } from "../abstractions/get-physics-world";
import { Hinge } from "../components/hinge";
import { ImmovableBox } from "@physics/components/immovable-box";

export class HingeSystem extends System {
  componentsRequired = new Set([Hinge]);
  addedHinges = new Map<Entity, CANNON.HingeConstraint>();

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const world = getPhysicsWorld(this.ecs);
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const hingeComponent = components.get(Hinge);

      const anchor = this.ecs
        .getComponents(hingeComponent.entity1)
        .get(ImmovableBox);

      const gravityBox = this.ecs
        .getComponents(hingeComponent.entity2)
        .get(GravityBox);

      if (!anchor || !gravityBox) {
        continue;
      }

      // Add the spring to the physics world if it hasn't been added yet
      if (!this.addedHinges.has(entity)) {
        const hinge = new CANNON.HingeConstraint(
          world.getBodyById(anchor.bodyId),
          world.getBodyById(gravityBox.bodyId),
          hingeComponent.config,
        );
        this.addedHinges.set(entity, hinge);
        world.addConstraint(hinge);
      }
    }
  }
}
