import { Entity, System } from "@ecs/ecs";
import { GlobalAudioSource } from "../components/global-audio-source";
import { Krampus } from "../components/krampus";
import { vec3 } from "wgpu-matrix";
import { KrampusProximity } from "../components/krampus-proximity";
import { Transform } from "@renderer/components/transform";
import { Camera } from "@renderer/components/camera";

export class KrampusProximitySystem extends System {
  componentsRequired = new Set([KrampusProximity, GlobalAudioSource]);
  baseVolumes = new Map<string, number>();

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    const krampus = this.ecs
      .getEntitiesithComponent(Krampus)
      .values()
      .next().value;
    const camera = this.ecs
      .getEntitiesithComponent(Camera)
      .values()
      .next().value;
    if (!krampus || !camera) {
      return;
    }
    const krampusTransform = this.ecs.getComponents(krampus).get(Transform);
    const krampusPosition = krampusTransform.position;
    const cameraTransform = this.ecs.getComponents(camera).get(Transform);
    const cameraPosition = cameraTransform.position;
    const distance = vec3.distance(cameraPosition, krampusPosition);

    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const krampusProximity = components.get(KrampusProximity);
      const globalAudioSource = components.get(GlobalAudioSource);
      if (!this.baseVolumes.has(globalAudioSource.path)) {
        globalAudioSource.volume = 0;
        this.baseVolumes.set(globalAudioSource.path, globalAudioSource.volume);
      }
      // Increase Volume as player gets closer to Krampus
      const volume =
        1 - Math.min(1, Math.max(0, distance / krampusProximity.radius));
      this.baseVolumes.get(globalAudioSource.path);

      globalAudioSource.volume = volume;
    }
  }
}
