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
import { Arena } from "../../components/arena";
import { PlayerBodySpring } from "../../components/player-body-spring";
import * as CANNON from "cannon-es";

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
        new Arena(),
        new GravityBox(floorVoxelObject.size, 5),
      );
      for (let x = -160; x < 160; x += 40) {
        for (let y = 40; y < 160; y += 40) {
          for (let z = -160; z < 160; z += 40) {
            const barrelEntity = this.ecs.addEntity();
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
      // Add player
      const player = this.ecs.addEntity();
      const vo = await createVoxelObject(
        device,
        volumeAtlas,
        `player`,
        `./game-jam/player.vxm`,
      );
      this.ecs.addComponents(
        player,
        new Transform([-20, 30, -80], quat.identity(), [1, 1, 1]),
        vo,
        new GamepadControllable(),
        // new ImmovableBox(vo.size),
        new GravityBox(vo.size, 5, new CANNON.Vec3(1, 0, 1)),
        new PlayerBodySpring(),
      );

      // Add sword
      const sword = this.ecs.addEntity();
      const swordVo = await createVoxelObject(
        device,
        volumeAtlas,
        `sword`,
        `./game-jam/wooden-sword.vxm`,
      );
      this.ecs.addComponents(
        sword,
        new Transform([-20, 30, -80], quat.identity(), [3, 3, 3]),
        swordVo,
        new GravityBox(swordVo.size),
      );

      init(device, volumeAtlas, this.ecs, []);
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
