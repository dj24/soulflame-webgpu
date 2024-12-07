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

const HAND_VOXELS_SIZE = [12, 38, 10];
const LANTERN_VOXELS_SIZE = [19, 39, 15];

export class FpsHandSystem extends System {
  componentsRequired = new Set([Camera, Transform]);
  isInitialized = false;
  handEntity: number;
  lanternEntity: number;
  targetHandRotation = quat.create();

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
        this.handEntity = this.ecs.addEntity();

        this.ecs.addComponents(
          this.handEntity,
          handVoxels,
          new Transform([0, 0, 0], quat.identity(), [0.1, 0.1, 0.1]),
          new ImmovableBox(handVoxels.size),
        );

        // Lantern
        this.lanternEntity = this.ecs.addEntity();
        this.ecs.addComponents(
          this.lanternEntity,
          lanternVoxels,
          new Transform([0, 0, 0], quat.identity(), [0.1, 0.1, 0.1]),
          new Hinge(this.handEntity, this.lanternEntity, {
            pivotA: new CANNON.Vec3(
              0,
              (handVoxels.size[1] / 2 - 5) * 0.1,
              1 * 0.1,
            ),
            pivotB: new CANNON.Vec3(
              0,
              (lanternVoxels.size[1] / 2 - 1.5) * 0.1,
              0,
            ),
            collideConnected: false,
          }),
          new GravityBox(lanternVoxels.size, 1, {
            angularDamping: 0.999,
            // linearDamping: 1.0,
          }),
          new Light(vec3.create(10, 10, 0)),
        );

        console.log({ handVoxels, lanternVoxels });
      });
    }
    // Follow every frame
    else {
      const handComponents = this.ecs.getComponents(this.handEntity);
      if (!handComponents) {
        return;
      }
      const handTransform = handComponents.get(Transform);
      const handBox = this.ecs.getComponents(this.handEntity).get(ImmovableBox);
      const handBody = physicsWorld.getBodyById(handBox.bodyId);
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
          handBody.quaternion.set(
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
      const newHandPosition = vec3.add(
        cameraTransform.position,
        vec3.transformQuat(
          vec3.create(-2, -1.5 + idleBob, 3),
          cameraTransform.rotation,
        ),
      );
      handBody.position.set(
        newHandPosition[0],
        newHandPosition[1],
        newHandPosition[2],
      );
    }
  }
}
