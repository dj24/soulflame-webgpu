import { Vector3 } from "./vector3";

export class Matrix4x4 {
  elements: number[];

  static get identity() {
    const m = new Matrix4x4();
    m.elements[0] = 1;
    m.elements[5] = 1;
    m.elements[10] = 1;
    m.elements[15] = 1;
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
    const result = new Matrix4x4();
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let sum = 0;
        for (let i = 0; i < 4; i++) {
          sum += this.get(row, i) * m.get(i, col);
        }
        result.set(row, col, sum);
      }
    }
    this.elements = result.elements;
  }

  translate(translate: Vector3): void {
    this.set(3, 0, translate.x);
    this.set(3, 1, translate.y);
    this.set(3, 2, translate.z);
  }

  scale(scale: Vector3): void {
    this.set(0, 0, scale.x);
    this.set(1, 1, scale.y);
    this.set(2, 2, scale.z);
  }
}
