import { Sword } from "../components/sword";
import { Entity, System } from "@ecs/ecs";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { getPhysicsWorld } from "../abstractions/get-physics-world";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { ImmovableBox } from "@physics/components/immovable-box";
import { FollowTarget } from "../components/follow-target";
import * as CANNON from "cannon-es";
import { GravityBox } from "@physics/components/gravity-box";

const swingTimeoutMs = 500;

const IDLE_OFFSET = vec3.create(12, 2, 0);
const IDLE_ROTATION = quat.fromEuler(90 * (Math.PI / 180), 0, 0, "zxy");

const SWING_DURATION_MS = 100;

export class SwordSystem extends System {
  componentsRequired = new Set([
    GamepadControllable,
    Sword,
    FollowTarget,
    ImmovableBox,
  ]);
  isSwinging = new Map<Entity, boolean>();
  canSwing = new Map<Entity, boolean>();
  addedEvents = new Map<Entity, Function>();

  update(entities: Set<Entity>, now: number): void {
    const physicsWorld = getPhysicsWorld(this.ecs);
    for (const entity of entities) {
      if (!this.isSwinging.has(entity)) {
        this.isSwinging.set(entity, false);
      }
      if (!this.canSwing.has(entity)) {
        this.canSwing.set(entity, true);
      }

      const components = this.ecs.getComponents(entity);
      const swordComponent = components.get(Sword);
      const immovableBoxComponent = components.get(ImmovableBox);
      const body = physicsWorld.getBodyById(immovableBoxComponent.bodyId);
      const followTargetComponent = components.get(FollowTarget);
      const attachedPlayerComponents = this.ecs.getComponents(
        swordComponent.playerEntity,
      );

      swordComponent.bodyId = immovableBoxComponent.bodyId;
      const playerTransform = attachedPlayerComponents.get(Transform);
      const gamepadControllable = components.get(GamepadControllable);
      const playerGravityBox = attachedPlayerComponents.get(GravityBox);

      if (!playerTransform || !playerGravityBox) {
        return;
      }

      const playerBody = physicsWorld.getBodyById(playerGravityBox.bodyId);

      const swingVelocity = vec3.add(
        vec3.mulScalar(playerTransform.left, 250),
        vec3.mulScalar(playerTransform.direction, 500),
      );
      followTargetComponent.position = IDLE_OFFSET;
      followTargetComponent.rotation = IDLE_ROTATION;

      if (this.isSwinging.get(entity)) {
        body.velocity.set(swingVelocity[0], swingVelocity[1], swingVelocity[2]);
      } else {
        body.velocity.set(0, 0, 0);
      }

      const gamepad = navigator.getGamepads()[gamepadControllable.player];

      if (!gamepad) {
        return;
      }

      if (!this.addedEvents.has(entity)) {
        const handleCollide = (event: any) => {
          // Don't allow the sword to collide with the player.
          if (event.body.id === playerBody.id) {
            return;
          }
          if (this.isSwinging.get(entity)) {
            event.body.applyImpulse(
              body.velocity.scale(0.1),
              new CANNON.Vec3(0, 0, 0),
            );
            const audio = document.getElementById(
              "sword-hit-audio",
            ) as HTMLAudioElement;
            audio.currentTime = 0;
            audio.volume = 0.1;
            audio.play();
            document.dispatchEvent(
              new CustomEvent("player-damaged", {
                detail: {
                  bodyId: event.body.id,
                },
              }),
            );
          }
        };
        body.addEventListener("collide", handleCollide);
        this.addedEvents.set(entity, handleCollide);
      }

      if (gamepad.buttons[0].pressed && this.canSwing.get(entity)) {
        this.isSwinging.set(entity, true);
        this.canSwing.set(entity, false);
        const audio = document.getElementById(
          "swoosh-audio",
        ) as HTMLAudioElement;
        audio.currentTime = 0;
        audio.volume = 0.5;
        audio.play();
        setTimeout(() => {
          this.isSwinging.set(entity, false);
        }, SWING_DURATION_MS);
        setTimeout(() => {
          this.canSwing.set(entity, true);
        }, swingTimeoutMs);
      }
    }
  }
}
