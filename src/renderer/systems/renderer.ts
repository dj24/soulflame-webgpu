import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame, init } from "@renderer/app";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";
import { createTavern, createVoxelObject } from "@renderer/create-tavern";
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
        `./Tavern/teapot.vxm`,
      );

      const dragon = this.ecs.addEntity();
      this.ecs.addComponent(dragon, new VoxelObject(dragonVoxels));
      this.ecs.addComponent(
        dragon,
        new Transform([0, 0, 0], quat.identity(), [1, 1, 1]),
      );

      init(device, volumeAtlas, this.ecs, [dragon]);
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
