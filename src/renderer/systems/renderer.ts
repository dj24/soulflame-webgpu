import { Entity, System } from "@ecs/ecs";
import { Camera } from "../components/camera";
import { Transform } from "../components/transform";
import { frame, init } from "@renderer/app";
import { getGpuDevice } from "@renderer/abstractions/get-gpu-device";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { VoxelObject } from "@renderer/voxel-object";
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
      init(device, volumeAtlas, this.ecs);
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
    const volumeAtlas = getGPUDeviceSingleton(this.ecs).volumeAtlas;

    // TODO: create add function that takes array
    const refreshAtlas = async () => {
      await volumeAtlas.clear();
      for (let entity of entities) {
        const components = this.ecs.getComponents(entity);
        const voxelObject = components.get(VoxelObject);
        await volumeAtlas.addOrReplaceVolume(
          voxelObject.name,
          voxelObject.size,
          voxelObject.uncompressedArrayBuffer,
          voxelObject.sizeInBytes,
        );
        const dictionaryElement = volumeAtlas.dictionary[voxelObject.name];
        if (dictionaryElement) {
          voxelObject.octreeBufferIndex = dictionaryElement.octreeOffset;
        }
      }
    };

    if (volumeAtlas) {
      refreshAtlas();
    }

    frame(
      now,
      this.ecs,
      cameraComponent,
      transformComponent,
      Array.from(entities),
    );
  }
}
