import { camera, canvas, debugValues } from "./app";

export class DebugUI {
  logElement;
  isMouseDown = false;
  constructor() {
    document.getElementById("reset").addEventListener("click", (event) => {
      window.dispatchEvent(new CustomEvent(`resetcamera`));
      document.getElementById("captures").innerHTML = "";
    });
    document.getElementById("capture").addEventListener("click", (event) => {
      const image = new Image();
      image.id = performance.now().toString();
      image.src = canvas.toDataURL();
      const imageElement = document
        .getElementById("captures")
        .appendChild(image);
      imageElement.addEventListener("click", (event) => {
        const img = event.target as HTMLImageElement;
        console.log(event.target);
      });
    });
    ["downscale", "fov", "scale", "translate", "objectcount"].forEach((id) => {
      document.getElementById(id).addEventListener("input", (event) => {
        const input = event.target as HTMLInputElement;
        window.dispatchEvent(
          new CustomEvent(`change${id}`, { detail: input.value }),
        );
      });
    });
    this.logElement = document.getElementById("log");

    const handleFovChange = (event: CustomEvent) => {
      camera.fieldOfView = parseFloat(event.detail);
    };
    window.addEventListener("changefov", handleFovChange);
    const handleTranslateChange = (event: CustomEvent) => {
      debugValues.targetTranslateX = parseFloat(event.detail) * 0.01;
    };

    window.addEventListener("changetranslate", handleTranslateChange);
    const handleScaleChange = (event: CustomEvent) => {
      debugValues.targetScale = parseFloat(event.detail);
    };
    window.addEventListener("changescale", handleScaleChange);
    window.addEventListener("resetcamera", () => {
      debugValues.targetTranslateX = 0;
      debugValues.targetScale = 1;
      debugValues.targetRotateY = 0;
    });
    const handleObjectCountChange = (event: CustomEvent) => {
      debugValues.objectCount = parseFloat(event.detail);
    };
    window.addEventListener("changeobjectcount", handleObjectCountChange);

    document
      .getElementById("webgpu-canvas")
      .addEventListener("mousedown", () => {
        this.isMouseDown = true;
      });
    document.getElementById("webgpu-canvas").addEventListener("mouseup", () => {
      this.isMouseDown = false;
    });
    document
      .getElementById("webgpu-canvas")
      .addEventListener("mouseleave", () => {
        this.isMouseDown = false;
      });
    window.addEventListener("mousemove", (event) => {
      if (!this.isMouseDown) {
        return;
      }
      debugValues.targetRotateY -= event.movementX * 0.005;
      // console.log(event.movementX, event.movementY);
    });
  }

  log(text: string) {
    this.logElement.innerText = text;
  }
}
