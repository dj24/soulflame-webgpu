import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame, init } from "@renderer/app";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";
import { createVoxelObject } from "@renderer/create-tavern";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { VoxelObject } from "@renderer/voxel-object";
import { quat, vec3 } from "wgpu-matrix";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { ImmovableBox } from "@physics/components/immovable-box";

export class Renderer extends System {
  componentsRequired = new Set([VoxelObject, Transform]);

  constructor() {
    super();
    getGpuDevice().then(async (device) => {
      const volumeAtlas = new VolumeAtlas(device);
      const gpu = getGPUDeviceSingleton(this.ecs);
      gpu.device = device;
      gpu.volumeAtlas = volumeAtlas;

      // const sponzaVoxels = await createVoxelObject(
      //   device,
      //   volumeAtlas,
      //   `Sponza`,
      //   `./sponza-small.vxm`,
      // );
      // let sponza = this.ecs.addEntity();
      // this.ecs.addComponent(sponza, new VoxelObject(sponzaVoxels));
      // this.ecs.addComponent(
      //   sponza,
      //   new Transform([0, 0, 0], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      // );

      const terrainVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `Terrain`,
        `./terrain.vxm`,
      );
      const newEntity = this.ecs.addEntity();
      this.ecs.addComponent(newEntity, new VoxelObject(terrainVoxels));
      this.ecs.addComponent(
        newEntity,
        new Transform([0, 0, 0], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      );

      // for (let x = -2048; x <= 2048; x += 256) {
      //   for (let z = -2048; z <= 2048; z += 256) {
      //     const newEntity = this.ecs.addEntity();
      //     this.ecs.addComponent(newEntity, new VoxelObject(terrainVoxels));
      //     this.ecs.addComponent(
      //       newEntity,
      //       new Transform([x, 0, z], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      //     );
      //   }
      // }

      // const dragonVoxels = await createVoxelObject(
      //   device,
      //   volumeAtlas,
      //   `Dragon`,
      //   `./Tavern/dragon.vxm`,
      // );
      //
      // let dragon = this.ecs.addEntity();
      // this.ecs.addComponent(dragon, new VoxelObject(dragonVoxels));
      // this.ecs.addComponent(
      //   dragon,
      //   new Transform([-60, 0, 0], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      // );
      // this.ecs.addComponent(dragon, new GamepadControllable());
      // this.ecs.addComponent(dragon, new ImmovableBox(dragonVoxels.size));
      //
      // const mengerVolxels = await createVoxelObject(
      //   device,
      //   volumeAtlas,
      //   `Menger`,
      //   `./menger.vxm`,
      // );
      //
      // let menger = this.ecs.addEntity();
      // this.ecs.addComponent(menger, new VoxelObject(mengerVolxels));
      // this.ecs.addComponent(
      //   menger,
      //   new Transform([60, 0, 0], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      // );
      // this.ecs.addComponent(menger, new GamepadControllable());

      // const teaPotVoxels = await createVoxelObject(
      //   device,
      //   volumeAtlas,
      //   `TeaPot`,
      //   `./Tavern/teapot.vxm`,
      // );
      //
      // for (let x = -300; x <= 300; x += 150) {
      //   for (let z = -300; z <= 300; z += 150) {
      //     const newEntity = this.ecs.addEntity();
      //     if (Math.random() > 0.5) {
      //       this.ecs.addComponent(newEntity, new VoxelObject(teaPotVoxels));
      //     } else {
      //       this.ecs.addComponent(newEntity, new VoxelObject(dragonVoxels));
      //     }
      //     this.ecs.addComponent(
      //       newEntity,
      //       new Transform(
      //         [x, 30, z],
      //         quat.fromEuler(0, (Math.PI / 180) * 180, 0, "xyz"),
      //         [1, 1, 1],
      //       ),
      //     );
      //   }
      // }

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
