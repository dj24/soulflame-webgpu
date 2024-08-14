import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame, init } from "@renderer/app";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";
import { createTavern } from "@renderer/create-tavern";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { VoxelObject } from "@renderer/voxel-object";

export class Renderer extends System {
  componentsRequired = new Set([Camera, Transform]);
  device: GPUDevice;
  private voxelObjects: VoxelObject[] = [];

  constructor() {
    super();
    getGpuDevice().then((device) => {
      this.device = device;
      const volumeAtlas = new VolumeAtlas(device);
      createTavern(this.device, volumeAtlas).then((tavern) => {
        init(this.device, volumeAtlas, tavern);
        this.voxelObjects = tavern;
      });
    });
  }

  update(entities: Set<Entity>, now: number): void {
    if (entities.size > 1) {
      console.warn("Only one camera can be rendered - ignoring the rest");
    }
    const cameraEntity = entities.values().next().value;
    const components = this.ecs.getComponents(cameraEntity);
    const cameraComponent = components.get(Camera);
    const transformComponent = components.get(Transform);
    const entitiesWithTransform = this.ecs.getEntitieswithComponent(Transform);

    frame(now, cameraComponent, transformComponent, this.voxelObjects);
  }
}
