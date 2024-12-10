import { Entity, System } from "@ecs/ecs";
import { GlobalAudioSource } from "../components/global-audio-source";

export class GlobalAudioSystem extends System {
  componentsRequired = new Set([GlobalAudioSource]);
  audioContext: AudioContext;
  audioSources: Map<string, AudioBufferSourceNode> = new Map();

  update(entities: Set<Entity>, now: number, deltaTime: number) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const globalAudioSource = components.get(GlobalAudioSource);
      if (!globalAudioSource) {
        continue;
      }
      if (this.audioSources.has(globalAudioSource.path)) {
        continue;
      }
      const source = this.audioContext.createBufferSource();
      this.audioSources.set(globalAudioSource.path, source);
      fetch(globalAudioSource.path)
        .then((response) => response.arrayBuffer())
        .then((buffer) => {
          this.audioContext.decodeAudioData(buffer, (audioBuffer) => {
            source.buffer = audioBuffer;
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = globalAudioSource.volume;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            source.loop = true;
            source.start();
          });
        });
    }
  }
}
