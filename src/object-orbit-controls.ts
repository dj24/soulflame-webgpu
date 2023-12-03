import { Vector2 } from "./vector2";
import { animate, glide } from "motion";
export class ObjectOrbitControls {
  velocity = Vector2.zero;
  animationFrame: ReturnType<typeof requestAnimationFrame>;
  constructor(onUpdate: (progress: number) => void) {
    window.addEventListener("mousemove", (event) => {
      const isLeftClick = event.buttons === 1;
      if (!isLeftClick) {
        return;
      }
      // cancelAnimationFrame(this.animationFrame);
      // this.velocity = new Vector2(event.movementX, event.movementY);
      // this.animationFrame = requestAnimationFrame(() => {
      //   this.velocity = Vector2.zero;
      // });
      animate(onUpdate, {
        easing: glide({ velocity: event.movementX, restDistance: 0.0001 }),
      });
    });
  }
}
