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
import { FollowTarget } from "../../components/follow-target";
import { Spawner } from "@input/components/spawner";

const PLAYER_MASS = 2;

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
        new ImmovableBox(floorVoxelObject.size),
        // new GravityBox(floorVoxelObject.size, 20),
      );

      const potVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `Pot`,
        `./game-jam/Pot4.vxm`,
      );
      const dragonVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `Dragon`,
        `./game-jam/Dragon.vxm`,
      );

      const potionVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `Potion`,
        `./game-jam/HealthPotion.vxm`,
      );
      const bombVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `Bomb`,
        `./game-jam/bomb.vxm`,
      );

      const spawner = this.ecs.addEntity();
      this.ecs.addComponents(
        spawner,
        new Spawner([potVoxels, dragonVoxels, potionVoxels, bombVoxels]),
      );
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
          quat.fromEuler(0, 90 * (Math.PI / 180), 0, "xyz"),
          [1.1, 1.1, 1.1],
        ),
        swordVo,
        new ImmovableBox(swordVo.size, {
          isTrigger: true,
        }),
        new Sword(player),
        new GamepadControllable(0),
        new FollowTarget(
          player,
          vec3.create(24, 12, -2),
          quat.fromEuler(0, 90 * (Math.PI / 180), -90 * (Math.PI / 180), "zxy"),
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
        new Transform([-20, 30, -80], quat.identity(), [1.2, 1.2, 1.2]),
        new Player(sword),
        vo,
        new GamepadControllable(0),
        new GravityBox(vo.size, PLAYER_MASS, new CANNON.Vec3(0, 0, 0)),
      );

      //Add Player 2
      const player2 = this.ecs.addEntity();
      const sword2 = this.ecs.addEntity();
      this.ecs.addComponents(
        sword2,
        new Transform(
          [-20, 30, -80],
          quat.fromEuler(0, 90 * (Math.PI / 180), 0, "xyz"),
          [1.1, 1.1, 1.1],
        ),
        swordVo,
        new ImmovableBox(swordVo.size, {
          isTrigger: true,
        }),
        new Sword(player2),
        new GamepadControllable(1),
        new FollowTarget(
          player2,
          vec3.create(24, 12, -2),
          quat.fromEuler(0, 90 * (Math.PI / 180), -90 * (Math.PI / 180), "zxy"),
        ),
      );
      const vo2 = await createVoxelObject(
        device,
        volumeAtlas,
        `player`,
        `./game-jam/player.vxm`,
      );
      this.ecs.addComponents(
        player2,
        new Transform([20, 30, -60], quat.identity(), [1.2, 1.2, 1.2]),
        vo2,
        new GamepadControllable(1),
        new GravityBox(vo.size, PLAYER_MASS, new CANNON.Vec3(0, 0, 0)),
        new Player(-1),
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
