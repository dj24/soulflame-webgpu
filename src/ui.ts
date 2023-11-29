import { camera, canvas } from "./app";

export class DebugUI {
  logElement;
  constructor() {
    document.getElementById("reset").addEventListener("click", (event) => {
      camera.reset({ fieldOfView: 90 });
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
    document.getElementById("downscale").addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      window.dispatchEvent(
        new CustomEvent("changeDownscale", { detail: input.value }),
      );
      const label = input.parentElement.getElementsByTagName("label")[0];
      label.innerText = `Downscale: ${parseFloat(input.value).toFixed(1)}`;
    });
    document.getElementById("fov").addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      window.dispatchEvent(
        new CustomEvent("changeFov", { detail: input.value }),
      );
      const label = input.parentElement.getElementsByTagName("label")[0];
      label.innerText = `FOV: ${parseFloat(input.value).toFixed(1)}`;
    });
    this.logElement = document.getElementById("log");
  }

  log(text: string) {
    this.logElement.innerText = text;
  }
}
