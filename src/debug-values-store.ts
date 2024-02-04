import { animate, glide } from "motion";
import { vec3 } from "wgpu-matrix";
import { deltaTime } from "./app";

export class DebugValuesStore {
  maxObjectCount;
  objectCount;
  scale;
  targetScale;
  translateX;
  targetTranslateX;
  rotateY;
  targetRotateY;
  sunRotateY;
  targetSunRotateY;

  constructor() {
    this.maxObjectCount = 192;
    this.objectCount = 192;
    this.scale = 1;
    this.translateX = 0;
    this.targetScale = 1;
    this.targetTranslateX = 0;
    this.rotateY = 0;
    this.targetRotateY = 0;
    this.sunRotateY = 2.6;
    this.targetSunRotateY = 2.6;
  }

  update() {
    animate(
      (progress: number) => {
        const distance = this.targetScale - this.scale;
        this.scale = this.scale + distance * progress;
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
    animate(
      (progress: number) => {
        const distance = this.targetTranslateX - this.translateX;
        this.translateX = this.translateX + distance * progress;
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
    animate(
      (progress: number) => {
        const distance = this.targetRotateY - this.rotateY;
        this.rotateY = this.rotateY + distance * progress;
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
    animate(
      (progress: number) => {
        const distance = this.targetSunRotateY - this.sunRotateY;
        this.sunRotateY = this.sunRotateY + distance * progress;
      },
      {
        easing: glide({
          velocity: 0.0002 * deltaTime,
        }),
      },
    );
  }
}
