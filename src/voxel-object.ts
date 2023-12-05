import { Mat4, Vec3 } from "wgpu-matrix";

export class VoxelObject {
  transform: Mat4;
  size: Vec3;
  constructor(m: Mat4, s: Vec3) {
    this.transform = m;
    this.size = s;
  }

  toArray() {
    return [...this.transform, ...this.size, 0.0]; //padding for 4 byte stride
  }
}
