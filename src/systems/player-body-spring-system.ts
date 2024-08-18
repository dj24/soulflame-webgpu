import { Entity, System } from "@ecs/ecs";
import { PlayerBodySpring } from "../components/player-body-spring";
import { GravityBox } from "@physics/components/gravity-box";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import * as CANNON from "cannon-es";

const TOP_PLAYER_PIVOT = new CANNON.Vec3(0, 8, 0);
const BOTTOM_PLAYER_PIVOT = new CANNON.Vec3(0, -8, 0);
const SPRING_TOP_Y = 10;
const SPRING_BOTTOM_Y = -10;

export class PlayerBodySpringSystem extends System {
  componentsRequired = new Set([PlayerBodySpring, GravityBox]);
  addedBottomBodies = new Map<Entity, CANNON.Body>();
  addedTopBodies = new Map<Entity, CANNON.Body>();
  addedTopSprings = new Map<Entity, CANNON.Spring>();
  addedBottomSprings = new Map<Entity, CANNON.Spring>();

  update(entities: Set<Entity>, now: number, deltaTime: number) {
    const physicsWorldEntity = this.ecs
      .getEntitiesithComponent(PhysicsWorldSingleton)
      .values()
      .next().value;
    const components = this.ecs.getComponents(physicsWorldEntity);
    const world = components.get(PhysicsWorldSingleton).world;

    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const playerBodySpringComponent = components.get(PlayerBodySpring);
      const gravityBoxComponent = components.get(GravityBox);
      const gravityBoxBody = world.getBodyById(gravityBoxComponent.bodyId);

      if (!this.addedBottomBodies.has(entity)) {
        const topBody = new CANNON.Body({
          mass: 0,
          type: CANNON.Body.KINEMATIC,
          position: new CANNON.Vec3(0, 0, 0),
          shape: new CANNON.Box(new CANNON.Vec3(1, 1, 1)),
          collisionFilterMask: 0,
        });
        const bottomBody = new CANNON.Body({
          mass: 0,
          type: CANNON.Body.KINEMATIC,
          position: new CANNON.Vec3(0, 0, 0),
          shape: new CANNON.Box(new CANNON.Vec3(1, 1, 1)),
          collisionFilterMask: 0,
        });
        world.addBody(topBody);
        world.addBody(bottomBody);
        playerBodySpringComponent.bottomBodyId = bottomBody.id;
        playerBodySpringComponent.topBodyId = topBody.id;
        this.addedBottomBodies.set(entity, bottomBody);
        this.addedTopBodies.set(entity, topBody);

        // Springs
        const topSpring = new CANNON.Spring(gravityBoxBody, topBody, {
          restLength: 0,
          stiffness: 50,
          damping: 10,
          localAnchorA: TOP_PLAYER_PIVOT,
          localAnchorB: new CANNON.Vec3(0, 0, 0),
        });
        this.addedTopSprings.set(entity, topSpring);

        const bottomSpring = new CANNON.Spring(gravityBoxBody, bottomBody, {
          restLength: 0,
          stiffness: 150,
          damping: 10,
          localAnchorA: BOTTOM_PLAYER_PIVOT,
          localAnchorB: new CANNON.Vec3(0, 0, 0),
        });
        this.addedBottomSprings.set(entity, bottomSpring);
      }

      const bottomBody = this.addedBottomBodies.get(entity);
      const topBody = this.addedTopBodies.get(entity);

      // Move the top and bottom bodies to the gravity box (player)
      bottomBody.position.set(
        gravityBoxBody.position.x,
        SPRING_BOTTOM_Y,
        gravityBoxBody.position.z,
      );
      topBody.position.set(
        gravityBoxBody.position.x,
        SPRING_TOP_Y,
        gravityBoxBody.position.z,
      );

      // this.addedBottomSprings.get(entity).applyForce();
      this.addedTopSprings.get(entity).applyForce();
    }
  }
}
