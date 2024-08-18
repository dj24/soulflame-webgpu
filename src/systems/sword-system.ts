import { Sword } from "../components/sword";
import { Entity, System } from "@ecs/ecs";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { getPhysicsWorld } from "../abstractions/get-physics-world";
import { GravityBox } from "@physics/components/gravity-box";
import * as CANNON from "cannon-es";
import { Transform } from "@renderer/components/transform";
import { vec3 } from "wgpu-matrix";

const swordImpulseForce = 600;
const swingTimeoutMs = 500;

export class SwordSystem extends System {
  componentsRequired = new Set([GamepadControllable, Sword, GravityBox]);
  isSwinging = false;

  update(entities: Set<Entity>, now: number): void {
    const physicsWorld = getPhysicsWorld(this.ecs);
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const gravityBox = components.get(GravityBox);
      const swordComponent = components.get(Sword);
      const attachedPlayerComponents = this.ecs.getComponents(
        swordComponent.playerEntity,
      );
      const playerTransform = attachedPlayerComponents.get(Transform);
      const gamepadControllable = components.get(GamepadControllable);

      const gamepad = navigator.getGamepads()[gamepadControllable.player];

      if (!gamepad) {
        return;
      }

      const swingDirection = playerTransform.direction;

      const localImpulsePoint = new CANNON.Vec3(0, 16, 0);

      if (gamepad.buttons[0].pressed && !this.isSwinging) {
        const swordBody = physicsWorld.getBodyById(gravityBox.bodyId);
        // apply to the top of the sword in the negative x direction
        swordBody.applyLocalImpulse(
          new CANNON.Vec3(-swordImpulseForce, 0, 0),
          localImpulsePoint,
        );
        this.isSwinging = true;
        setTimeout(() => {
          this.isSwinging = false;
        }, swingTimeoutMs);
      }
    }
  }
}
