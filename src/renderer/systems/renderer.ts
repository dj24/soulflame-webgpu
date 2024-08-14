import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame, init } from "@renderer/app";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";
import { createTavern } from "@renderer/create-tavern";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { VoxelObject } from "@renderer/voxel-object";

export class Renderer extends System {
  componentsRequired = new Set([VoxelObject, Transform]);
  device: GPUDevice;

  constructor() {
    super();
    getGpuDevice().then((device) => {
      const volumeAtlas = new VolumeAtlas(device);
      createTavern(device, volumeAtlas, this.ecs).then((tavern) => {
        init(
          device,
          volumeAtlas,
          this.ecs,
          Array.from(this.ecs.getEntitiesithComponent(VoxelObject).values()),
        );
      });
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
