import { createUniformBuffer } from "./buffer-utils";
import { deltaTime } from "./app";

export class Vector3 {
  x: number;
  y: number;
  z: number;
  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  get uniformBuffer() {
    return createUniformBuffer([this.x, this.y, this.z]);
  }

  static zero = new Vector3(0, 0, 0);
  static one = new Vector3(1, 1, 1);
  static up = new Vector3(0, 1, 0);
  static down = new Vector3(0, -1, 0);
  static left = new Vector3(-1, 0, 0);
  static right = new Vector3(1, 0, 0);

  toArray() {
    return [this.x, this.y, this.z];
  }

  mul(v: Vector3 | number) {
    if (v instanceof Vector3) {
      return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
    }
    if (typeof v === "number") {
      return new Vector3(this.x * v, this.y * v, this.z * v);
    }
    throw new Error("Can only multiply Vector3 by Vector3 or Number");
  }

  add(val: Vector3) {
    return new Vector3(this.x + val.x, this.y + val.y, this.z + val.z);
  }

  subtract(val: Vector3) {
    return new Vector3(this.x - val.x, this.y - val.y, this.z - val.z);
  }

  cross(val: Vector3) {
    return new Vector3(
      this.y * val.z - this.z * val.y,
      this.z * val.x - this.x * val.z,
      this.x * val.y - this.y * val.x,
    );
  }

  normalize() {
    const length = Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
    return new Vector3(this.x / length, this.y / length, this.z / length);
  }

  negate() {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  rotateAroundAxis(axis: Vector3, angle: number): Vector3 {
    const cosTheta = Math.cos(angle);
    const sinTheta = Math.sin(angle);

    const rotatedX =
      this.x * (cosTheta + (1 - cosTheta) * axis.x * axis.x) +
      this.y * ((1 - cosTheta) * axis.x * axis.y - sinTheta * axis.z) +
      this.z * ((1 - cosTheta) * axis.x * axis.z + sinTheta * axis.y);

    const rotatedY =
      this.x * ((1 - cosTheta) * axis.y * axis.x + sinTheta * axis.z) +
      this.y * (cosTheta + (1 - cosTheta) * axis.y * axis.y) +
      this.z * ((1 - cosTheta) * axis.y * axis.z - sinTheta * axis.x);

    const rotatedZ =
      this.x * ((1 - cosTheta) * axis.z * axis.x - sinTheta * axis.y) +
      this.y * ((1 - cosTheta) * axis.z * axis.y + sinTheta * axis.x) +
      this.z * (cosTheta + (1 - cosTheta) * axis.z * axis.z);

    return new Vector3(rotatedX, rotatedY, rotatedZ);
  }
}
