import { ECS, Entity, System } from "@ecs/ecs";
import { TerrainSingleton } from "../components/terrain-singleton";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { createTerrainChunk } from "../create-terrain-chunk";
import { VoxelObject } from "@renderer/voxel-object";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";

const chunkWidth = 64;

const foo = async (ecs: ECS) => {
  const volumeAtlas = getGPUDeviceSingleton(ecs).volumeAtlas;
  for (let x = -256; x <= 256; x += chunkWidth) {
    for (let z = -256; z <= 256; z += chunkWidth) {
      const newEntity = ecs.addEntity();
      const terrainVoxels = await createTerrainChunk(volumeAtlas, chunkWidth, [
        x,
        0,
        z,
      ]);
      ecs.addComponent(newEntity, new VoxelObject(terrainVoxels));
      ecs.addComponent(
        newEntity,
        new Transform([x, 0, z], quat.fromEuler(0, 0, 0, "xyz"), [1, 1, 1]),
      );
    }
  }
};
export class TerrainSystem extends System {
  componentsRequired = new Set([TerrainSingleton]);
  isInitialized = false;

  update(entities: Set<Entity>) {
    const gpuSingleton = getGPUDeviceSingleton(this.ecs);
    if (!gpuSingleton.device || entities.size === 0) {
      return;
    }
    const components = this.ecs.getComponents(entities.values().next().value);
    const terrainSingleton = components.get(TerrainSingleton);
    if (!this.isInitialized) {
      foo(this.ecs);
      this.isInitialized = true;
    }
  }
}
