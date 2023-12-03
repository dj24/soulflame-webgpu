import { Vector2 } from "./vector2";
import {canvas} from "./app";
export class MouseControls {
  velocity = Vector2.zero;
  animationFrame: ReturnType<typeof requestAnimationFrame>;
  isCursorLocked = false;
  constructor() {
    const canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
    canvas.addEventListener("click", async () => {
      canvas.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.isCursorLocked = document.pointerLockElement !== null;
    });
    window.addEventListener("mousemove", (event) => {
      cancelAnimationFrame(this.animationFrame);
      this.velocity = new Vector2(event.movementX, event.movementY);
      this.animationFrame = requestAnimationFrame(() => {
        this.velocity = Vector2.zero;
      });
    });
  }
}
