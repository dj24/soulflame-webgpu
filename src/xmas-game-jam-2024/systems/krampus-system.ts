import { Entity, System } from "@ecs/ecs";
import { Krampus } from "../components/krampus";
import { BoxRayIntersect } from "../../components/box-ray-intersect";
import { Transform } from "@renderer/components/transform";
import { Camera } from "@renderer/components/camera";
import { Quat, Vec3, quat, vec3 } from "wgpu-matrix";

const getRandomPolarCoordinate = (radius: number) => {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI;
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
};

export class KrampusSystem extends System {
  componentsRequired = new Set([Krampus, BoxRayIntersect]);
  lastMoveTime = 0;
  moveInterval = 10000;
  playerDistance = 30;

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const players = this.ecs.getEntitiesithComponent(Camera);
    const firstPlayer = players.values().next().value;
    const firstKrampus = entities.values().next().value;

    if (!firstPlayer || !firstKrampus) {
      return;
    }
    if (time > this.lastMoveTime + this.moveInterval) {
      this.lastMoveTime = time;
      const playerComponents = this.ecs.getComponents(firstPlayer);
      const playerTransform = playerComponents.get(Transform);

      const krampusComponents = this.ecs.getComponents(firstKrampus);
      const krampusTransform = krampusComponents.get(Transform);

      // const randomPolars = getRandomPolarCoordinate(this.playerDistance);
      // krampusTransform.position[0] =
      //   playerTransform.position[0] + randomPolars[0];
      // krampusTransform.position[2] =
      //   playerTransform.position[2] + randomPolars[1];
      krampusTransform.position = vec3.add(
        playerTransform.position,
        vec3.mulScalar(playerTransform.direction, this.playerDistance),
      );

      // Look at the player
      const viewDirection = vec3.normalize(
        vec3.subtract(krampusTransform.position, playerTransform.position),
      );

      const yaw = Math.atan2(viewDirection[0], viewDirection[2]);
      const rotation = quat.fromEuler(0, yaw, 0, "xyz");
      krampusTransform.rotation = rotation;

      console.log("Krampus moved to ", krampusTransform.position);
    }
  }
}
