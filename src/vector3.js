export class Vector3 {
  x;
  y;
  z;
  constructor(x, y, z) {
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
  static right = new Vector3(1, 1, 0);

  toArray() {
    return [this.x, this.y, this.z];
  }

  mul(val) {
    if (val instanceof Vector3) {
      return new Vector3(this.x * val.x, this.y * val.y, this.z * val.z);
    }
    if (typeof val === "number") {
      return new Vector3(this.x * val, this.y * val, this.z * val);
    }
    throw new Error("Can only multiply Vector3 by Vector3 or Number");
  }

  add(val) {
    return new Vector3(this.x + val.x, this.y + val.y, this.z + val.z);
  }

  subtract(val) {
    return new Vector3(this.x - val.x, this.y - val.y, this.z - val.z);
  }

  cross(val) {
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
}
