import { animate, glide } from "motion";
import {vec2} from "wgpu-matrix";
export class ObjectOrbitControls {
  velocity = vec2.create(0, 0);
  animationFrame: ReturnType<typeof requestAnimationFrame>;
  constructor() {
    window.addEventListener("mousemove", (event) => {
      const isLeftClick = event.buttons === 1;
      if (!isLeftClick) {
        return;
      }
      animate((progress) => {
        this.velocity[0] = -progress;
      }, {
        easing: glide({ velocity: event.movementX, restDistance: 0.0001 }),
      });
      animate((progress) => {
        this.velocity[1] = progress;
      }, {
        easing: glide({ velocity: event.movementY, restDistance: 0.0001 }),
      });
    });
  }
}
