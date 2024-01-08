import { vec2 } from "wgpu-matrix";

export class MouseControls {
  velocity = vec2.create(0, 0);
  animationFrame: ReturnType<typeof requestAnimationFrame>;
  isCursorLocked = false;
  constructor() {
    const canvas = document.getElementById(
      "webgpu-canvas",
    ) as HTMLCanvasElement;
    canvas.addEventListener("click", async () => {
      canvas.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.isCursorLocked = document.pointerLockElement !== null;
    });
    window.addEventListener("mousemove", (event) => {
      // cancelAnimationFrame(this.animationFrame);
      // this.velocity = [event.movementX, event.movementY];
      // this.animationFrame = requestAnimationFrame(() => {
      //   this.velocity = [0,0];
      // });
    });
  }
}
