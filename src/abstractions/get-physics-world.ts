import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { ECS } from "@ecs/ecs";

export const getPhysicsWorld = (ecs: ECS) => {
  const physicsWorldEntity = ecs
    .getEntitiesithComponent(PhysicsWorldSingleton)
    .values()
    .next().value;
  const components = ecs.getComponents(physicsWorldEntity);
  return components.get(PhysicsWorldSingleton).world;
};
