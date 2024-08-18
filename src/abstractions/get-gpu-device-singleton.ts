import { ECS } from "@ecs/ecs";
import { GPUDeviceSingleton } from "@renderer/components/gpu-device-singleton";

export const getGPUDeviceSingleton = (ecs: ECS) => {
  const gpuDeviceSingleton = ecs
    .getEntitiesithComponent(GPUDeviceSingleton)
    .values()
    .next().value;
  const components = ecs.getComponents(gpuDeviceSingleton);
  return components.get(GPUDeviceSingleton);
};
