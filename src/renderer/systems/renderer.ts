import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame, init } from "@renderer/app";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";
import { createTavern, createVoxelObject } from "@renderer/create-tavern";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { VoxelObject } from "@renderer/voxel-object";
import { quat, vec3 } from "wgpu-matrix";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GravityBox } from "@physics/components/gravity-box";
import { ImmovableBox } from "@physics/components/immovable-box";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { Arena } from "../../components/arena";
import { PlayerBodySpring } from "../../components/player-body-spring";
import * as CANNON from "cannon-es";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { Spring } from "../../components/spring";
import { Sword } from "../../components/sword";
import { Player } from "../../components/player";
import { Hinge } from "../../components/hinge";

export class Renderer extends System {
  componentsRequired = new Set([VoxelObject, Transform]);

  constructor() {
    super();
    getGpuDevice().then(async (device) => {
      const volumeAtlas = new VolumeAtlas(device);
      const gpu = getGPUDeviceSingleton(this.ecs);
      gpu.device = device;
      gpu.volumeAtlas = volumeAtlas;

      // Add floor
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

      // Debug barrels
      for (let x = -160; x < 160; x += 40) {
        for (let y = 40; y < 80; y += 40) {
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

      // Add sword
      const sword = this.ecs.addEntity();
      // Add player
      const player = this.ecs.addEntity();

      const swordVo = await createVoxelObject(
        device,
        volumeAtlas,
        `sword`,
        `./game-jam/wooden-sword.vxm`,
      );
      this.ecs.addComponents(
        sword,
        new Transform(
          [-20, 30, -80],
          quat.fromEuler(0, 90, 0, "xyz"),
          [2, 2, 2],
        ),
        swordVo,
        new GravityBox(swordVo.size, 2, new CANNON.Vec3(1, 1, 1)),
        new Sword(player),
        new GamepadControllable(0),
        new Spring(
          player,
          sword,
          new CANNON.Vec3(16, 4, 4),
          new CANNON.Vec3(0, 0, 0),
          {
            stiffness: 200,
            damping: 5,
          },
        ),
      );

      const vo = await createVoxelObject(
        device,
        volumeAtlas,
        `player`,
        `./game-jam/player.vxm`,
      );
      this.ecs.addComponents(
        player,
        new Transform([-20, 30, -80], quat.identity(), [1, 1, 1]),
        new Player(),
        vo,
        new GamepadControllable(0),
        new GravityBox(vo.size, 10, new CANNON.Vec3(0, 0, 0)),
        new Hinge(player, sword, {
          // collideConnected: false,
          pivotA: new CANNON.Vec3(0, 4, 4),
          pivotB: new CANNON.Vec3(0, -16, 0),
          axisA: new CANNON.Vec3(0, 1, 0),
          axisB: new CANNON.Vec3(0, 0, 1),
        }),
        // new Spring(
        //   player,
        //   sword,
        //   new CANNON.Vec3(8, 0, 0),
        //   new CANNON.Vec3(0, -8, 0),
        //   {
        //     stiffness: 200,
        //   },
        // ),
      );

      //Add Player 2
      const player2 = this.ecs.addEntity();
      const vo2 = await createVoxelObject(
        device,
        volumeAtlas,
        `player`,
        `./game-jam/player.vxm`,
      );
      this.ecs.addComponents(
        player2,
        new Transform([20, 30, -60], quat.identity(), [1, 1, 1]),
        vo2,
        new GamepadControllable(1),
        new GravityBox(vo.size, 10, new CANNON.Vec3(0, 0, 0)),
        new Player(),
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
