import { System, Entity } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { GravityBox } from "@physics/components/gravity-box";
import { getPhysicsWorld } from "../../abstractions/get-physics-world";
import { Player } from "../../components/player";
import * as CANNON from "cannon-es";

const deadzone = 0.1;
const velocityMultiplier = 0.1;
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

      const { position } = transformComponent;
      const { axes } = gamepad;

      let direction = vec3.create(0, 0, 0);
      if (Math.abs(axes[0]) > deadzone) {
        direction[0] = axes[0];
      }
      if (Math.abs(axes[1]) > deadzone) {
        direction[2] = -axes[1];
      }

      vec3.normalize(direction, direction);

      const newPosition = vec3.add(
        position,
        vec3.mulScalar(direction, velocityMultiplier * deltaTime),
      );

      const hopOffset =
        Math.abs(axes[0]) > deadzone || Math.abs(axes[1]) > deadzone
          ? Math.sin(now * 0.02) * 0.25
          : 0;

      body.position.set(
        newPosition[0],
        newPosition[1] + hopOffset,
        newPosition[2],
      );
    }
  }
}
