import { Entity, System } from "@ecs/ecs";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { AudioSource } from "../components/audio-source";
import { Transform } from "@renderer/components/transform";
import { vec3, Vec3 } from "wgpu-matrix";

export class FootstepAudioSystem extends System {
  componentsRequired = new Set([KeyboardControllable, AudioSource, Transform]);
  audioContext: AudioContext;
  audioBuffers: Map<string, AudioBuffer> = new Map();
  audioSources: Map<number, AudioBufferSourceNode> = new Map();
  previousPositions: Map<number, Vec3> = new Map();
  playState: Map<number, boolean> = new Map();

  update(entities: Set<Entity>, now: number, deltaTime: number) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      fetch("./xmas-game-jam-2024/reverb-clap.wav")
        .then((response) => response.arrayBuffer())
        .then((buffer) => {
          this.audioContext.decodeAudioData(buffer, (audioBuffer) => {
            this.audioBuffers.set("convolver", audioBuffer);
          });
        });
    }
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const audioSource = components.get(AudioSource);
      const transform = components.get(Transform);
      if (!audioSource) {
        continue;
      }
      if (
        this.audioBuffers.has(audioSource.path) &&
        this.previousPositions.has(entity) &&
        this.playState.has(entity)
      ) {
        const previousPosition = this.previousPositions.get(entity);
        // Check if the entity has moved, and if the audio is playing
        if (
          !this.playState.get(entity) &&
          vec3.distance(previousPosition, transform.position) > 0.05
        ) {
          this.playState.set(entity, true);
          // Play the audio
          const source = this.audioContext.createBufferSource();
          const convolver = this.audioContext.createConvolver();

          this.audioSources.set(entity, source);
          source.buffer = this.audioBuffers.get(audioSource.path);
          convolver.buffer = this.audioBuffers.get("convolver");

          // Source Volume
          const dryGain = this.audioContext.createGain();
          dryGain.gain.value = 0;
          dryGain.gain.linearRampToValueAtTime(
            audioSource.volume,
            this.audioContext.currentTime + 0.5,
          );

          // Convolver Volume
          const wetGain = this.audioContext.createGain();
          wetGain.gain.value = 0;
          wetGain.gain.linearRampToValueAtTime(
            audioSource.volume * 0.9,
            this.audioContext.currentTime + 0.5,
          );

          // Connect the source to the dry path
          source.connect(dryGain);

          // Connect the source to the ConvolverNode for the wet path
          source.connect(convolver);
          convolver.connect(wetGain);

          // Merge the dry and wet paths and send to the destination
          dryGain.connect(this.audioContext.destination);
          wetGain.connect(this.audioContext.destination);
          // Play
          source.loop = true;
          source.start();
        } else if (
          this.playState.get(entity) &&
          vec3.distance(previousPosition, transform.position) < 0.05
        ) {
          this.playState.set(entity, false);
          // Stop the audio
          this.audioSources.get(entity).stop();
        }
      } else {
        this.playState.set(entity, false);
        fetch(audioSource.path)
          .then((response) => response.arrayBuffer())
          .then((buffer) => {
            this.audioContext.decodeAudioData(buffer, (audioBuffer) => {
              this.audioBuffers.set(audioSource.path, audioBuffer);
            });
          });
      }
      this.previousPositions.set(entity, transform.position);
    }
  }
}
