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

export class Renderer extends System {
  componentsRequired = new Set([VoxelObject, Transform]);

  constructor() {
    super();
    getGpuDevice().then(async (device) => {
      const volumeAtlas = new VolumeAtlas(device);
      const gpu = getGPUDeviceSingleton(this.ecs);
      gpu.device = device;
      gpu.volumeAtlas = volumeAtlas;

      const teaPotVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `TeaPot`,
        `./Tavern/teapot.vxm`,
      );

      const dragonVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `Dragon`,
        `./Tavern/Dragon.vxm`,
      );

      // let teaPot = this.ecs.addEntity();
      // this.ecs.addComponent(teaPot, new VoxelObject(teaPotVoxels));
      // this.ecs.addComponent(
      //   teaPot,
      //   new Transform([50, 0, 0], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      // );
      //
      // let dragon = this.ecs.addEntity();
      // this.ecs.addComponent(dragon, new VoxelObject(dragonVoxels));
      // this.ecs.addComponent(
      //   dragon,
      //   new Transform([-50, 0, 0], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      // );

      const giantTeaPot = this.ecs.addEntity();
      this.ecs.addComponent(giantTeaPot, new VoxelObject(teaPotVoxels));
      this.ecs.addComponent(
        giantTeaPot,
        new Transform(
          [0, -3090, 0],
          quat.fromEuler(180 * (Math.PI / 180), 0, 0, "xyz"),
          [100, 100, 100],
        ),
      );

      for (let x = -2400; x <= 2400; x += 150) {
        for (let z = -2400; z <= 2400; z += 150) {
          const newEntity = this.ecs.addEntity();
          // if (Math.random() > 0.5) {
          this.ecs.addComponent(newEntity, new VoxelObject(teaPotVoxels));
          // } else {
          //   this.ecs.addComponent(newEntity, new VoxelObject(dragonVoxels));
          // }
          this.ecs.addComponent(
            newEntity,
            new Transform(
              [x + Math.random() * 50, 0, z + Math.random() * 50],
              quat.identity(),
              [1, 1, 1],
            ),
          );
        }
      }

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
