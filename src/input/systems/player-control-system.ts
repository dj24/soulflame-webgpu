import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { GravityBox } from "@physics/components/gravity-box";
import { getPhysicsWorld } from "../../abstractions/get-physics-world";
import { Player } from "../../components/player";

const deadzone = 0.1;
const velocityMultiplier = 100;
export class PlayerControlSystem extends System {
  componentsRequired = new Set([
    GravityBox,
    Transform,
    GamepadControllable,
    Player,
  ]);

  update(entities: Set<Entity>, now: number, deltaTime: number): void {
    const world = getPhysicsWorld(this.ecs);

    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const gravityBoxComponent = components.get(GravityBox);
      const transformComponent = components.get(Transform);
      const controllableComponent = components.get(GamepadControllable);
      const gamepad = navigator.getGamepads()[controllableComponent.player];

      if (!gamepad) {
        return;
      }

      const body = world.getBodyById(gravityBoxComponent.bodyId);

      const velocityX =
        Math.abs(gamepad.axes[0]) > deadzone
          ? gamepad.axes[0] * velocityMultiplier
          : body.velocity.x;
      const velocityY =
        Math.abs(gamepad.axes[1]) > deadzone
          ? -gamepad.axes[1] * velocityMultiplier
          : body.velocity.z;

      body.velocity.set(velocityX, body.velocity.y, velocityY);
    }
  }
}
