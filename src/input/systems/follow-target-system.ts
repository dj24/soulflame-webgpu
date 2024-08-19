import { System } from "@ecs/ecs";
import { FollowTarget } from "../../components/follow-target";
import { Transform } from "@renderer/components/transform";
import { ImmovableBox } from "@physics/components/immovable-box";
import * as CANNON from "cannon-es";
import { getPhysicsWorld } from "../../abstractions/get-physics-world";
import { quat, vec3 } from "wgpu-matrix";

export class FollowTargetSystem extends System {
  componentsRequired = new Set([FollowTarget, Transform, ImmovableBox]);

  update(entities: Set<number>, now: number, deltaTime: number): void {
    const physicsWorld = getPhysicsWorld(this.ecs);
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const followTarget = components.get(FollowTarget);
      const transform = components.get(Transform);
      const immovableBox = components.get(ImmovableBox);
      const followTargetComponents = this.ecs.getComponents(
        followTarget.targetEntity,
      );
      const targetTransform = followTargetComponents.get(Transform);

      if (!targetTransform) {
        return;
      }

      const rightOffset = vec3.mulScalar(
        targetTransform.right,
        followTarget.position[0],
      );
      const upOffset = vec3.mulScalar(
        targetTransform.up,
        followTarget.position[1],
      );
      const forwardOffset = vec3.mulScalar(
        targetTransform.direction,
        followTarget.position[2],
      );
      const targetOffset = vec3.add(
        vec3.add(rightOffset, upOffset),
        forwardOffset,
      );

      const speed = followTarget.speed * deltaTime;

      const immovableBoxBody = physicsWorld.getBodyById(immovableBox.bodyId);

      // Interpolate
      const targetPosition = vec3.add(targetTransform.position, targetOffset);
      const currentPosition = transform.position;
      const interpolatedPosition = vec3.lerp(
        currentPosition,
        targetPosition,
        speed,
      );
      immovableBoxBody.position.set(
        interpolatedPosition[0],
        interpolatedPosition[1],
        interpolatedPosition[2],
      );

      const targetRotation = quat.mul(
        targetTransform.rotation,
        followTarget.rotation,
      );
      const interpolatedRotation = quat.slerp(
        transform.rotation,
        targetRotation,
        speed,
      );

      immovableBoxBody.quaternion.set(
        interpolatedRotation[0],
        interpolatedRotation[1],
        interpolatedRotation[2],
        interpolatedRotation[3],
      );

      // const velocity = vec3.mulScalar(
      //   vec3.sub(targetPosition, currentPosition),
      //   10,
      // );
      // const rotationalVelocity = quat.mul(
      //   targetTransform.rotation,
      //   followTarget.rotation,
      // );
      //
      // immovableBoxBody.velocity.set(velocity[0], velocity[1], velocity[2]);
      //
      // immovableBoxBody.angularVelocity.set(
      //   rotationalVelocity[0],
      //   rotationalVelocity[1],
      //   rotationalVelocity[2],
      // );
    }
  }
}
