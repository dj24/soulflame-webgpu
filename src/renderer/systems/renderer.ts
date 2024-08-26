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

      const dragonVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `Dragon`,
        `./Tavern/dragon.vxm`,
      );

      const teaPotVoxels = await createVoxelObject(
        device,
        volumeAtlas,
        `TeaPot`,
        `./Tavern/teapot.vxm`,
      );

      let renderables = [];

      for (let x = -600; x <= 600; x += 150) {
        for (let z = 0; z <= 1200; z += 150) {
          const newEntity = this.ecs.addEntity();
          // if (Math.random() > 0.5) {
          this.ecs.addComponent(newEntity, new VoxelObject(dragonVoxels));
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
          renderables.push(newEntity);
        }
      }

      init(device, volumeAtlas, this.ecs, renderables);
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
