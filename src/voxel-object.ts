import {mat4, Mat4, vec3, Vec3} from "wgpu-matrix";

export class VoxelObject {
  transform: Mat4;
  inverseTransform: Mat4;
  size: Vec3;
  constructor(m: Mat4, s: Vec3) {
    this.transform = m;
    this.size = s;
    this.inverseTransform = mat4.create();
    mat4.invert(this.transform, this.inverseTransform);
  }

  get worldSpaceBounds() {
    let minBound = vec3.create();
    let maxBound = vec3.create();
    vec3.transformMat4(vec3.create(), this.transform, minBound);
    vec3.transformMat4(this.size, this.transform, maxBound);
    return { minBound, maxBound };
  }

  get worldSpaceCenter() {
    return vec3.lerp(
      this.worldSpaceBounds.minBound,
      this.worldSpaceBounds.maxBound,
      0.5,
    );
  }

  toArray() {
    return [...this.inverseTransform, ...this.size, 0.0]; //padding for 4 byte stride
  }
}
