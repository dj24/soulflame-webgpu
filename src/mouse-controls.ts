import { Vector2 } from "./vector2";
export class MouseControls {
  velocity = Vector2.zero;
  animationFrame: ReturnType<typeof requestAnimationFrame>;
  constructor() {
    window.addEventListener("mousemove", (event) => {
      cancelAnimationFrame(this.animationFrame);
      this.velocity = new Vector2(event.movementX, event.movementY);
      this.animationFrame = requestAnimationFrame(() => {
        this.velocity = Vector2.zero;
      });
    });
  }
}
