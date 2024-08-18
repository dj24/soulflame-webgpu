import { Entity, System } from "@ecs/ecs";
import { GravityBox } from "@physics/components/gravity-box";
import * as CANNON from "cannon-es";
import { getPhysicsWorld } from "../abstractions/get-physics-world";
import { Hinge } from "../components/hinge";

export class HingeSystem extends System {
  componentsRequired = new Set([Hinge]);
  addedHinges = new Map<Entity, CANNON.HingeConstraint>();

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const world = getPhysicsWorld(this.ecs);
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const hingeComponent = components.get(Hinge);

      const gravityBox1 = this.ecs
        .getComponents(hingeComponent.entity1)
        .get(GravityBox);
      const gravityBox2 = this.ecs
        .getComponents(hingeComponent.entity2)
        .get(GravityBox);

      if (!gravityBox1 || !gravityBox2) {
        continue;
      }

      // Add the spring to the physics world if it hasn't been added yet
      if (!this.addedHinges.has(entity)) {
        const hinge = new CANNON.HingeConstraint(
          world.getBodyById(gravityBox1.bodyId),
          world.getBodyById(gravityBox2.bodyId),
          hingeComponent.config,
        );
        this.addedHinges.set(entity, hinge);
        world.addConstraint(hinge);
      }
    }
  }
}
