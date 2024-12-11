import { Entity, System } from "@ecs/ecs";
import { Krampus } from "../components/krampus";
import { BoxRayIntersect } from "../../components/box-ray-intersect";
import { Transform } from "@renderer/components/transform";
import { Camera } from "@renderer/components/camera";
import { Quat, Vec3, quat, vec3, vec2 } from "wgpu-matrix";
import { PresentCount } from "../components/present-count";

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
  playerDistance = 200;

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const players = this.ecs.getEntitiesithComponent(Camera);
    const firstPlayer = players.values().next().value;
    const firstKrampus = entities.values().next().value;

    if (!firstPlayer || !firstKrampus) {
      return;
    }

    const playerComponents = this.ecs.getComponents(firstPlayer);
    const presentCount = playerComponents.get(PresentCount);

    if (presentCount.count === 0) {
      return;
    }

    const krampusComponents = this.ecs.getComponents(firstKrampus);
    const krampusTransform = krampusComponents.get(Transform);
    const playerTransform = playerComponents.get(Transform);

    switch (presentCount.count) {
      case 1:
        this.playerDistance = 300;
        break;
      case 2:
        this.playerDistance = 200;
        break;
      case 3:
        this.playerDistance = 100;
        break;
    }

    if (time > this.lastMoveTime + this.moveInterval) {
      this.lastMoveTime = time;

      if (presentCount.count >= 3) {
        krampusTransform.position = vec3.add(
          playerTransform.position,
          vec3.mulScalar(playerTransform.direction, this.playerDistance),
        );
      } else {
        const randomNormalisedVec2 = vec2.normalize([
          Math.random() - 0.5,
          Math.random() - 0.5,
        ]);

        krampusTransform.position = [
          playerTransform.position[0] +
            randomNormalisedVec2[0] * this.playerDistance,
          playerTransform.position[1] + 5,
          playerTransform.position[2] +
            randomNormalisedVec2[1] * this.playerDistance,
        ];
      }

      // Look at the player

      console.log("Krampus moved to ", krampusTransform.position);
    }

    const viewDirection = vec3.normalize(
      vec3.subtract(krampusTransform.position, playerTransform.position),
    );

    const yaw = Math.atan2(viewDirection[0], viewDirection[2]);
    const rotation = quat.fromEuler(0, yaw, 0, "xyz");
    krampusTransform.rotation = rotation;
  }
}
