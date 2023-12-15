import { camera, canvas, debugValues } from "./app";
import { animate, spring } from "motion";
import { vec3 } from "wgpu-matrix";

const startingCameraFieldOfView = 70;
const startingCameraPosition = vec3.create(0, 64, 0);
const startingCameraDirection = vec3.normalize(vec3.create(1, -0.33, 1));

const animateCameraToStartingPosition = () => {
  const targetDirection = startingCameraDirection;
  const startDirection = camera.direction;
  const targetFieldOfView = startingCameraFieldOfView;
  const startFieldOfView = camera.fieldOfView;
  const startScale = debugValues.scale;
  const startTranslateX = debugValues.translateX;
  const targetScale = 1;
  const targetTranslateX = 0;
  camera.targetPosition = startingCameraPosition;
  animate(
    (progress: number) => {
      camera.direction = vec3.add(
        startDirection,
        vec3.mulScalar(
          vec3.subtract(targetDirection, startDirection),
          progress,
        ),
      );
      camera.fieldOfView =
        startFieldOfView + (targetFieldOfView - startFieldOfView) * progress;
      debugValues.scale = startScale + (targetScale - startScale) * progress;
      debugValues.translateX =
        startTranslateX + (targetTranslateX - startTranslateX) * progress;
    },
    {
      easing: spring({
        restDistance: 0.0001,
        damping: 300,
        stiffness: 700,
        mass: 8,
      }),
    },
  );
};

export class DebugUI {
  logElement;
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
      debugValues.translateX = parseFloat(event.detail);
    };

    window.addEventListener("changetranslate", handleTranslateChange);
    const handleScaleChange = (event: CustomEvent) => {
      debugValues.scale = parseFloat(event.detail);
    };
    window.addEventListener("changescale", handleScaleChange);
    animateCameraToStartingPosition();
    window.addEventListener("resetcamera", animateCameraToStartingPosition);
    const handleObjectCountChange = (event: CustomEvent) => {
      debugValues.objectCount = parseFloat(event.detail);
    };
    window.addEventListener("changeobjectcount", handleObjectCountChange);
  }

  log(text: string) {
    this.logElement.innerText = text;
  }
}
