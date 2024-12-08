import { vec2 } from "wgpu-matrix";

export class MouseControls {
  velocity = vec2.create();

  constructor() {
    let timeout = setTimeout(() => {}, 0);
    let animationFrame = requestAnimationFrame(() => {});
    window.addEventListener("mousemove", (event) => {
      cancelAnimationFrame(animationFrame);
      this.velocity[0] = event.movementX;
      this.velocity[1] = event.movementY;
      animationFrame = requestAnimationFrame(() => {
        this.velocity[0] = 0;
        this.velocity[1] = 0;
      });
    });
  }
}
