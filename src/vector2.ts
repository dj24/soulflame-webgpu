import { createUniformBuffer } from "./buffer-utils";

export class Vector2 {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get uniformBuffer() {
    return createUniformBuffer([this.x, this.y]);
  }

  static zero = new Vector2(0, 0);
  static one = new Vector2(1, 1);
  static up = new Vector2(0, 1);
  static down = new Vector2(0, -1);
  static left = new Vector2(-1, 0);
  static right = new Vector2(1, 1);
  toArray() {
    return [this.x, this.y];
  }

  mul(val: Vector2) {
    if (val instanceof Vector2) {
      return new Vector2(this.x * val.x, this.y * val.y);
    }
    if (typeof val === "number") {
      return new Vector2(this.x * val, this.y * val);
    }
    throw new Error("Can only multiply Vector2 by Vector2 or Number");
  }

  add(val: Vector2) {
    return new Vector2(this.x + val.x, this.y + val.y);
  }

  subtract(val: Vector2) {
    return new Vector2(this.x - val.x, this.y - val.y);
  }

  normalize() {
    const length = Math.sqrt(this.x ** 2 + this.y ** 2);
    return new Vector2(this.x / length, this.y / length);
  }

  negate() {
    return new Vector2(-this.x, -this.y);
  }
}
