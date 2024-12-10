import { Entity, System } from "@ecs/ecs";
import { Light } from "@renderer/components/light";
import { LightFlicker } from "../components/light-flicker";
import { fractalNoise2D } from "../../procgen/fractal-noise-3d";

export class LightFlickerSystem extends System {
  componentsRequired = new Set([LightFlicker, Light]);
  baseLightColours = new Map<Entity, [number, number, number]>();

  update(entities: Set<Entity>, time?: number, deltaTime?: number) {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const light = components.get(Light);
      const lightFlicker = components.get(LightFlicker);

      if (!this.baseLightColours.has(entity)) {
        this.baseLightColours.set(entity, [
          light.color[0],
          light.color[1],
          light.color[2],
        ]);
      }

      const currentIntensity =
        lightFlicker.flickerIntensity +
        (fractalNoise2D(time * lightFlicker.flickerSpeed, 0) * 0.5 + 0.5) *
          (1.0 - lightFlicker.flickerIntensity);

      light.color = [
        this.baseLightColours.get(entity)[0] * currentIntensity,
        this.baseLightColours.get(entity)[1] * currentIntensity,
        this.baseLightColours.get(entity)[2] * currentIntensity,
      ];
    }
  }
}
