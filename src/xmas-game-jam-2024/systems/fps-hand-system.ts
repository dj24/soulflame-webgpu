import { Entity, System } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { processNewVoxelImport } from "@renderer/create-tavern";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { quat, vec2, vec3 } from "wgpu-matrix";
import { animate, glide } from "motion";
import { Hinge } from "../../components/hinge";
import { GravityBox } from "@physics/components/gravity-box";
import * as CANNON from "cannon-es";
import { ImmovableBox } from "@physics/components/immovable-box";
import { getPhysicsWorld } from "../../abstractions/get-physics-world";
import { HingeSystem } from "../../systems/hinge-system";
import { Light } from "@renderer/components/light";
import { LightFlicker } from "../components/light-flicker";

export class FpsHandSystem extends System {
  componentsRequired = new Set([Camera, Transform]);
  isInitialized = false;
  handEntity: number;
  lanternEntity: number;
  lightEntity: number;
  targetHandRotation = quat.create();
  localPhysicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -150, 0),
  });
  localLanternBody: CANNON.Body;
  localHandBody: CANNON.Body;

  update(entities: Set<Entity>, now: number, deltaTime: number) {
    const gpuSingleton = getGPUDeviceSingleton(this.ecs);
    const physicsWorld = getPhysicsWorld(this.ecs);
    if (!gpuSingleton.device || entities.size === 0) {
      return;
    }
    const entity = entities.values().next().value;
    const components = this.ecs.getComponents(entity);
    if (!this.isInitialized) {
      this.isInitialized = true;

      const promises = [
        processNewVoxelImport(
          "./xmas-game-jam-2024/hand.vxm",
          gpuSingleton.device,
        ),
        processNewVoxelImport(
          "./xmas-game-jam-2024/lantern.vxm",
          gpuSingleton.device,
        ),
      ];

      Promise.all(promises).then(([handVoxels, lanternVoxels]) => {
        // Hand
        const handScale = 0.1;
        this.handEntity = this.ecs.addEntity();
        this.ecs.addComponents(
          this.handEntity,
          handVoxels,
          new Transform([0, 0, 0], quat.identity(), [
            handScale,
            handScale,
            handScale,
          ]),
        );
        this.localHandBody = new CANNON.Body({
          position: new CANNON.Vec3(0, 0, 0),
          shape: new CANNON.Box(
            new CANNON.Vec3(
              (handVoxels.size[0] / 2) * handScale,
              (handVoxels.size[1] / 2) * handScale,
              (handVoxels.size[2] / 2) * handScale,
            ),
          ),
        });
        this.localPhysicsWorld.addBody(this.localHandBody);

        // Lantern
        const lanternScale = 0.075;
        this.lanternEntity = this.ecs.addEntity();
        this.ecs.addComponents(
          this.lanternEntity,
          lanternVoxels,
          new Transform([0, 0, 0], quat.identity(), [
            lanternScale,
            lanternScale,
            lanternScale,
          ]),
        );
        this.localLanternBody = new CANNON.Body({
          mass: 1,
          angularDamping: 0.9,
          linearDamping: 0.9,
          position: new CANNON.Vec3(0, 0, 0),
          shape: new CANNON.Box(
            new CANNON.Vec3(
              (lanternVoxels.size[0] / 2) * lanternScale,
              (lanternVoxels.size[1] / 2) * lanternScale,
              (lanternVoxels.size[2] / 2) * lanternScale,
            ),
          ),
        });
        this.localPhysicsWorld.addBody(this.localLanternBody);

        // Hinge
        const hinge = new CANNON.HingeConstraint(
          this.localHandBody,
          this.localLanternBody,
          {
            pivotA: new CANNON.Vec3(
              0,
              (handVoxels.size[1] / 2 - 5) * handScale,
              handScale,
            ),
            pivotB: new CANNON.Vec3(
              0,
              (lanternVoxels.size[1] / 2 - 1.5) * lanternScale,
              0,
            ),
            // axisA: new CANNON.Vec3(0, 0, 1),
            collideConnected: false,
          },
        );
        this.localPhysicsWorld.addConstraint(hinge);

        // Light
        this.lightEntity = this.ecs.addEntity();
        this.ecs.addComponents(
          this.lightEntity,
          new Transform([0, 0, 0], quat.identity(), [1, 1, 1]),
          new Light([400, 300, 120]),
          new LightFlicker(),
        );
      });
    }
    // Follow every frame
    else {
      const handComponents = this.ecs.getComponents(this.handEntity);
      if (!handComponents) {
        return;
      }
      const handTransform = handComponents.get(Transform);
      const cameraTransform = components.get(Transform);

      // Hand
      this.targetHandRotation = quat.mul(
        cameraTransform.rotation,
        quat.fromEuler(60 * (3.142 / 180), 0, -10 * (3.142 / 180), "xyz"),
      );
      animate(
        (progress: number) => {
          const newRotation = quat.slerp(
            handTransform.rotation,
            this.targetHandRotation,
            progress,
          );
          this.localHandBody.quaternion.set(
            newRotation[0],
            newRotation[1],
            newRotation[2],
            newRotation[3],
          );
        },
        {
          easing: glide({
            velocity: 0.1,
          }),
        },
      );

      const idleBob = 0.075 * Math.sin(now / 500);
      const leftHandOffset = vec3.transformQuat(
        vec3.create(-3, -1.5 + idleBob, 5),
        cameraTransform.rotation,
      );

      const lanternTransform = this.ecs
        .getComponents(this.lanternEntity)
        .get(Transform);

      // Local Physics
      this.localPhysicsWorld.fixedStep(deltaTime / 1000);
      handTransform.rotation = [
        this.localHandBody.quaternion.x,
        this.localHandBody.quaternion.y,
        this.localHandBody.quaternion.z,
        this.localHandBody.quaternion.w,
      ];
      handTransform.position = [
        this.localHandBody.position.x,
        this.localHandBody.position.y,
        this.localHandBody.position.z,
      ];
      handTransform.position = vec3.add(handTransform.position, leftHandOffset);
      handTransform.position = vec3.add(
        handTransform.position,
        cameraTransform.position,
      );

      lanternTransform.rotation = [
        this.localLanternBody.quaternion.x,
        this.localLanternBody.quaternion.y,
        this.localLanternBody.quaternion.z,
        this.localLanternBody.quaternion.w,
      ];
      lanternTransform.position = [
        this.localLanternBody.position.x,
        this.localLanternBody.position.y,
        this.localLanternBody.position.z,
      ];
      lanternTransform.position = vec3.add(
        lanternTransform.position,
        leftHandOffset,
      );
      lanternTransform.position = vec3.add(
        lanternTransform.position,
        cameraTransform.position,
      );

      // Light
      const lightComponents = this.ecs.getComponents(this.lightEntity);
      if (!lightComponents) {
        return;
      }
      const lightTransform = lightComponents.get(Transform);
      if (!lightTransform) {
        return;
      }
      lightTransform.position = vec3.add(
        lanternTransform.position,
        vec3.transformQuat([0, -1.3, 0], lanternTransform.rotation),
      );
    }
  }
}
