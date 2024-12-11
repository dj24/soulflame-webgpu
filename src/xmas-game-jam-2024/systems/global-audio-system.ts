import { Entity, System } from "@ecs/ecs";
import { GlobalAudioSource } from "../components/global-audio-source";

export class GlobalAudioSystem extends System {
  componentsRequired = new Set([GlobalAudioSource]);
  audios: Map<string, HTMLAudioElement> = new Map();

  update(entities: Set<Entity>, now: number, deltaTime: number) {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const globalAudioSource = components.get(GlobalAudioSource);
      if (!globalAudioSource) {
        continue;
      }
      if (!this.audios.has(globalAudioSource.path)) {
        const audio = new Audio(globalAudioSource.path);
        audio.volume = 0;
        audio.loop = true;
        this.audios.set(globalAudioSource.path, audio);
        audio.play().catch(() => {
          console.error(`Failed to play audio: ${globalAudioSource.path}`);
          this.audios.delete(globalAudioSource.path);
        });
      }
      const audio = this.audios.get(globalAudioSource.path);
      audio.volume = globalAudioSource.volume;
    }
  }
}
