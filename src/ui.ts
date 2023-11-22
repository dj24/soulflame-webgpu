import { camera, canvas, setDownscale } from "./app";

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
    document.getElementById("downscale").addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      setDownscale(parseFloat(input.value));
    });
    this.logElement = document.getElementById("log");
  }

  log(text: string) {
    this.logElement.innerText = text;
  }
}
