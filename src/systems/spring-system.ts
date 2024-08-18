import { Entity, System } from "@ecs/ecs";
import { Spring } from "../components/spring";
import { GravityBox } from "@physics/components/gravity-box";
import * as CANNON from "cannon-es";
import { getPhysicsWorld } from "../abstractions/get-physics-world";

export class SpringSystem extends System {
  componentsRequired = new Set([Spring]);
  addedSprings = new Map<Entity, CANNON.Spring>();

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const world = getPhysicsWorld(this.ecs);
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const springComponent = components.get(Spring);

      const gravityBox1 = this.ecs
        .getComponents(springComponent.entity1)
        .get(GravityBox);
      const gravityBox2 = this.ecs
        .getComponents(springComponent.entity2)
        .get(GravityBox);

      if (!gravityBox1 || !gravityBox2) {
        continue;
      }

      // Add the spring to the physics world if it hasn't been added yet
      if (!this.addedSprings.has(entity)) {
        const spring = new CANNON.Spring(
          world.getBodyById(gravityBox1.bodyId),
          world.getBodyById(gravityBox2.bodyId),
          {
            localAnchorA: springComponent.pivot1,
            localAnchorB: springComponent.pivot2,
            ...springComponent.config,
          },
        );
        this.addedSprings.set(entity, spring);
      }
    }

    for (const [, spring] of this.addedSprings) {
      spring.applyForce();
    }
  }
}
