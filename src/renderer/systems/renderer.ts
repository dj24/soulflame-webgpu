import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame, init } from "@renderer/app";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";
import { createTavern, createVoxelObject } from "@renderer/create-tavern";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { VoxelObject } from "@renderer/voxel-object";
import { quat } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GravityBox } from "@physics/components/gravity-box";
import { ImmovableBox } from "@physics/components/immovable-box";

export class Renderer extends System {
  componentsRequired = new Set([VoxelObject, Transform]);

  constructor() {
    super();
    getGpuDevice().then(async (device) => {
      const volumeAtlas = new VolumeAtlas(device);
      // const teapotVoxelObject = await createVoxelObject(
      //   device,
      //   volumeAtlas,
      //   "Teapot",
      //   `./Tavern/teapot.vxm`,
      // );
      // const teapotEntity = this.ecs.addEntity();
      // this.ecs.addComponents(
      //   teapotEntity,
      //   new Transform([-80.0, -10, -50], quat.identity(), [1.0, 0.05, 1.0]),
      //   teapotVoxelObject,
      //   new KeyboardControllable(),
      //   new ImmovableBox([1.0, 0.1, 1.0]),
      // );
      const renderableEntities = [];
      for (let x = -70; x < 10; x += 2) {
        for (let y = 10; y < 20; y += 4) {
          const barrelEntity = this.ecs.addEntity();
          renderableEntities.push(barrelEntity);
          const barrelVoxelObject = await createVoxelObject(
            device,
            volumeAtlas,
            `Barrel-${x}${y}`,
            `./Tavern/barrel.vxm`,
          );
          this.ecs.addComponents(
            barrelEntity,
            new Transform([x, y, -37], quat.identity(), [1, 1, 1]),
            barrelVoxelObject,
            new GravityBox([1, 1, 1]),
          );
        }
      }

      init(device, volumeAtlas, this.ecs, renderableEntities);
    });
  }

  update(entities: Set<Entity>, now: number): void {
    const camera = this.ecs
      .getEntitiesithComponent(Camera)
      .values()
      .next().value;

    const cameraComponents = this.ecs.getComponents(camera);
    const cameraComponent = cameraComponents.get(Camera);
    const transformComponent = cameraComponents.get(Transform);

    frame(
      now,
      this.ecs,
      cameraComponent,
      transformComponent,
      Array.from(entities),
    );
  }
}
