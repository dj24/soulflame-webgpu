import { Entity, System } from "@ecs/ecs";
import { Bomb } from "../components/bomb";
import { getPhysicsWorld } from "../abstractions/get-physics-world";
import { GravityBox } from "@physics/components/gravity-box";
import * as CANNON from "cannon-es";
import { Transform } from "@renderer/components/transform";

export class BombSystem extends System {
  componentsRequired = new Set([Bomb, GravityBox, Transform]);
  startTimes = new Map<Entity, number>();

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const physicsWorld = getPhysicsWorld(this.ecs);
    const audio = document.getElementById(
      "bomb-fuse-audio",
    ) as HTMLAudioElement;
    const bombAudio = document.getElementById(
      "bomb-explosion-audio",
    ) as HTMLAudioElement;
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const bomb = components.get(Bomb);
      const gravityBox = components.get(GravityBox);
      const transform = components.get(Transform);
      const bombBody = physicsWorld.getBodyById(gravityBox.bodyId);

      if (!bombBody) {
        continue;
      }

      if (!this.startTimes.has(entity)) {
        this.startTimes.set(entity, time);
        audio.volume = 0.2;
        audio.play();
        audio.currentTime = 1;
        setTimeout(() => {
          bombAudio.volume = 0.2;
          bombAudio.currentTime = 0;
          bombAudio.play();
          physicsWorld.bodies.forEach((body) => {
            const directionToExplosion = body.position
              .vsub(bombBody.position)
              .unit();
            const distance = body.position.distanceTo(bombBody.position);
            const force = 500 - distance;
            body.applyImpulse(
              directionToExplosion.vmul(new CANNON.Vec3(force, force, force)),
            );
          });
          this.ecs.removeEntity(entity);
          audio.pause();
        }, bomb.timer * 1000);
      }

      const timeSinceStart = time - this.startTimes.get(entity);
      const scale = 1 + timeSinceStart * 0.0005;
      transform.scale = [scale, scale, scale];
      if (timeSinceStart > bomb.timer * 1000 - 50) {
        transform.scale = [scale * 2, scale * 0.5, scale * 2];
      }
    }
  }
}
