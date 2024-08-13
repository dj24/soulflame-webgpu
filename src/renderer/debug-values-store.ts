import { NumberAnimation, Vec3Animation } from "./abstractions/animation";

export class DebugValuesStore {
  #scale: NumberAnimation;
  #translateX: NumberAnimation;
  #rotateY: NumberAnimation;
  #sunRotateY;

  constructor() {
    this.#scale = new NumberAnimation(1);
    this.#translateX = new NumberAnimation(0);
    this.#rotateY = new NumberAnimation(0);
    this.#sunRotateY = new NumberAnimation(-3.0);
  }

  set targetScale(value: number) {
    this.#scale.target = value;
  }

  set targetTranslateX(value: number) {
    this.#translateX.target = value;
  }

  set targetRotateY(value: number) {
    this.#rotateY.target = value;
  }

  set targetSunRotateY(value: number) {
    this.#sunRotateY.target = value;
  }

  get targetScale() {
    return this.#scale.target;
  }

  get targetTranslateX() {
    return this.#translateX.target;
  }

  get targetRotateY() {
    return this.#rotateY.target;
  }

  get targetSunRotateY() {
    return this.#sunRotateY.target;
  }

  get sunRotateY() {
    return this.#sunRotateY.value;
  }

  get scale() {
    return this.#scale.value;
  }

  get translateX() {
    return this.#translateX.value;
  }
}
