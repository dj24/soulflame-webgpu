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
import { GamepadControllable } from "@input/components/gamepad-controllable";

export class Renderer extends System {
  componentsRequired = new Set([VoxelObject, Transform]);

  constructor() {
    super();
    getGpuDevice().then(async (device) => {
      const volumeAtlas = new VolumeAtlas(device);
      const floorVoxelObject = await createVoxelObject(
        device,
        volumeAtlas,
        "floor",
        `./game-jam/floor.vxm`,
      );
      const floorEntity = this.ecs.addEntity();
      this.ecs.addComponents(
        floorEntity,
        new Transform([0, -10, 0], quat.identity(), [10, 10, 10]),
        floorVoxelObject,
        new ImmovableBox(floorVoxelObject.size),
      );
      const renderableEntities = [floorEntity];
      for (let x = -120; x < 30; x += 20) {
        for (let y = 30; y < 120; y += 30) {
          for (let z = -50; z < 50; z += 20) {
            const barrelEntity = this.ecs.addEntity();
            renderableEntities.push(barrelEntity);
            const barrelVoxelObject = await createVoxelObject(
              device,
              volumeAtlas,
              `Barrel-${x}${y}${z}`,
              `./Tavern/barrel.vxm`,
            );
            this.ecs.addComponents(
              barrelEntity,
              new Transform([x, y, z - 37], quat.identity(), [1, 1, 1]),
              barrelVoxelObject,
              new GravityBox(barrelVoxelObject.size),
            );
          }
        }
      }
      const player = this.ecs.addEntity();
      renderableEntities.push(player);
      const vo = await createVoxelObject(
        device,
        volumeAtlas,
        `player`,
        `./game-jam/player.vxm`,
      );
      this.ecs.addComponents(
        player,
        new Transform([-20, 40, -80], quat.identity(), [1, 1, 1]),
        vo,
        new GamepadControllable(),
        new ImmovableBox(vo.size),
      );

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
