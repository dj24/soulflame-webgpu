import { Vector3 } from "./vector3";

export class Matrix4x4 {
  elements: number[];

  /*
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    0,0,0,1
  */
  static get identity() {
    const m = new Matrix4x4();
    m.set(0, 0, 1);
    m.set(1, 1, 1);
    m.set(2, 2, 1);
    m.set(3, 3, 1);
    return m;
  }

  constructor() {
    this.elements = new Array(16).fill(0);
  }

  set(row: number, col: number, value: number): void {
    this.elements[row * 4 + col] = value;
  }

  get(row: number, col: number): number {
    return this.elements[row * 4 + col];
  }

  multiply(m: Matrix4x4): void {
    const tempElements = this.elements.slice();  // Create a copy of the current elements
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let sum = 0;
        for (let i = 0; i < 4; i++) {
          sum += tempElements[row * 4 + i] * m.get(i, col);
        }
        this.elements[row * 4 + col] = sum;  // Update the current object directly
      }
    }
  }

  translate(translate: Vector3): void {
    let translationMatrix = Matrix4x4.identity;
    translationMatrix.set(0, 3, translate.x);
    translationMatrix.set(1, 3, translate.y);
    translationMatrix.set(2, 3, translate.z);
    this.multiply(translationMatrix);
  }

  scale(scale: Vector3): void {
    const scalingMatrix = Matrix4x4.identity;
    scalingMatrix.set(0, 0, scale.x);
    scalingMatrix.set(1, 1, scale.y);
    scalingMatrix.set(2, 2, scale.z);
    this.multiply(scalingMatrix);
  }

  rotateY(angle: number): Matrix4x4 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.set(0, 0, cos);
    this.set(0, 2, -sin); // Corrected sign here
    this.set(2, 0, sin); // Corrected sign here
    this.set(2, 2, cos);
    return this;
  }

  invert(): Matrix4x4 {
    const result = new Matrix4x4();

    const a00 = this.get(0, 0),
      a01 = this.get(0, 1),
      a02 = this.get(0, 2),
      a03 = this.get(0, 3);
    const a10 = this.get(1, 0),
      a11 = this.get(1, 1),
      a12 = this.get(1, 2),
      a13 = this.get(1, 3);
    const a20 = this.get(2, 0),
      a21 = this.get(2, 1),
      a22 = this.get(2, 2),
      a23 = this.get(2, 3);
    const a30 = this.get(3, 0),
      a31 = this.get(3, 1),
      a32 = this.get(3, 2),
      a33 = this.get(3, 3);

    const det =
      a00 * a11 * a22 * a33 -
      a00 * a11 * a23 * a32 -
      a00 * a12 * a21 * a33 +
      a00 * a12 * a23 * a31 +
      a00 * a13 * a21 * a32 -
      a00 * a13 * a22 * a31 -
      a01 * a10 * a22 * a33 +
      a01 * a10 * a23 * a32 +
      a01 * a12 * a20 * a33 -
      a01 * a12 * a23 * a30 -
      a01 * a13 * a20 * a32 +
      a01 * a13 * a22 * a30 +
      a02 * a10 * a21 * a33 -
      a02 * a10 * a23 * a31 -
      a02 * a11 * a20 * a33 +
      a02 * a11 * a23 * a30 +
      a02 * a13 * a20 * a31 -
      a02 * a13 * a21 * a30 -
      a03 * a10 * a21 * a32 +
      a03 * a10 * a22 * a31 +
      a03 * a11 * a20 * a32 -
      a03 * a11 * a22 * a30 -
      a03 * a12 * a20 * a31 +
      a03 * a12 * a21 * a30;

    if (det === 0) {
      throw new Error("Matrix inversion is not possible, determinant is 0.");
    }

    const invDet = 1 / det;

    result.set(
      0,
      0,
      (a11 * a22 * a33 -
        a11 * a23 * a32 -
        a12 * a21 * a33 +
        a12 * a23 * a31 +
        a13 * a21 * a32 -
        a13 * a22 * a31) *
        invDet,
    );
    result.set(
      0,
      1,
      (-a01 * a22 * a33 +
        a01 * a23 * a32 +
        a02 * a21 * a33 -
        a02 * a23 * a31 -
        a03 * a21 * a32 +
        a03 * a22 * a31) *
        invDet,
    );
    result.set(
      0,
      2,
      (a01 * a12 * a33 -
        a01 * a13 * a32 -
        a02 * a11 * a33 +
        a02 * a13 * a31 +
        a03 * a11 * a32 -
        a03 * a12 * a31) *
        invDet,
    );
    result.set(
      0,
      3,
      (-a01 * a12 * a23 +
        a01 * a13 * a22 +
        a02 * a11 * a23 -
        a02 * a13 * a21 -
        a03 * a11 * a22 +
        a03 * a12 * a21) *
        invDet,
    );

    result.set(
      1,
      0,
      (-a10 * a22 * a33 +
        a10 * a23 * a32 +
        a12 * a20 * a33 -
        a12 * a23 * a30 -
        a13 * a20 * a32 +
        a13 * a22 * a30) *
        invDet,
    );
    result.set(
      1,
      1,
      (a00 * a22 * a33 -
        a00 * a23 * a32 -
        a02 * a20 * a33 +
        a02 * a23 * a30 +
        a03 * a20 * a32 -
        a03 * a22 * a30) *
        invDet,
    );
    result.set(
      1,
      2,
      (-a00 * a12 * a33 +
        a00 * a13 * a32 +
        a02 * a10 * a33 -
        a02 * a13 * a30 -
        a03 * a10 * a32 +
        a03 * a12 * a30) *
        invDet,
    );
    result.set(
      1,
      3,
      (a00 * a12 * a23 -
        a00 * a13 * a22 -
        a02 * a10 * a23 +
        a02 * a13 * a20 +
        a03 * a10 * a22 -
        a03 * a12 * a20) *
        invDet,
    );

    result.set(
      2,
      0,
      (a10 * a21 * a33 -
        a10 * a23 * a31 -
        a11 * a20 * a33 +
        a11 * a23 * a30 +
        a13 * a20 * a31 -
        a13 * a21 * a30) *
        invDet,
    );
    result.set(
      2,
      1,
      (-a00 * a21 * a33 +
        a00 * a23 * a31 +
        a01 * a20 * a33 -
        a01 * a23 * a30 -
        a03 * a20 * a31 +
        a03 * a21 * a30) *
        invDet,
    );
    result.set(
      2,
      2,
      (a00 * a11 * a33 -
        a00 * a13 * a31 -
        a01 * a10 * a33 +
        a01 * a13 * a30 +
        a03 * a10 * a31 -
        a03 * a11 * a30) *
        invDet,
    );
    result.set(
      2,
      3,
      (-a00 * a11 * a23 +
        a00 * a13 * a21 +
        a01 * a10 * a23 -
        a01 * a13 * a20 -
        a03 * a10 * a21 +
        a03 * a11 * a20) *
        invDet,
    );

    result.set(
      3,
      0,
      (-a10 * a21 * a32 +
        a10 * a22 * a31 +
        a11 * a20 * a32 -
        a11 * a22 * a30 -
        a12 * a20 * a31 +
        a12 * a21 * a30) *
        invDet,
    );
    result.set(
      3,
      1,
      (a00 * a21 * a32 -
        a00 * a22 * a31 -
        a01 * a20 * a32 +
        a01 * a22 * a30 +
        a02 * a20 * a31 -
        a02 * a21 * a30) *
        invDet,
    );
    result.set(
      3,
      2,
      (-a00 * a11 * a32 +
        a00 * a12 * a31 +
        a01 * a10 * a32 -
        a01 * a12 * a30 -
        a02 * a10 * a31 +
        a02 * a11 * a30) *
        invDet,
    );
    result.set(
      3,
      3,
      (a00 * a11 * a22 -
        a00 * a12 * a21 -
        a01 * a10 * a22 +
        a01 * a12 * a20 +
        a02 * a10 * a21 -
        a02 * a11 * a20) *
        invDet,
    );

    return result;
  }
}
