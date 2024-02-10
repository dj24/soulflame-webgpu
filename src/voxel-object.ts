import { mat4, Mat4, vec3, Vec3 } from "wgpu-matrix";

export class VoxelObject {
  transform: Mat4;
  inverseTransform: Mat4;
  previousTransform: Mat4;
  previousInverseTransform: Mat4;
  size: Vec3;
  atlasLocation: Vec3;
  constructor(transform: Mat4, size: Vec3, atlasLocation: Vec3) {
    this.transform = transform;
    this.size = size;
    this.inverseTransform = mat4.invert(this.transform);
    this.previousTransform = mat4.clone(this.transform);
    this.previousInverseTransform = mat4.clone(this.inverseTransform);
    this.atlasLocation = atlasLocation;
  }

  get worldSpaceBounds() {
    let minBound = vec3.transformMat4(vec3.create(), this.transform);
    let maxBound = vec3.transformMat4(this.size, this.transform);
    return { minBound, maxBound };
  }

  get objectSpaceCorners() {
    return [
      [0, 0, 0],
      [0, 0, this.size[2]],
      [0, this.size[1], 0],
      [0, this.size[1], this.size[2]],
      [this.size[0], 0, 0],
      [this.size[0], 0, this.size[2]],
      [this.size[0], this.size[1], 0],
      [this.size[0], this.size[1], this.size[2]],
    ];
  }

  get worldSpaceCorners() {
    return this.objectSpaceCorners.map((corner) => {
      return vec3.transformMat4(corner, this.transform);
    });
  }

  get worldSpaceCenter() {
    return vec3.lerp(
      this.worldSpaceBounds.minBound,
      this.worldSpaceBounds.maxBound,
      0.5,
    );
  }

  toArray() {
    return [
      ...this.transform,
      ...this.inverseTransform,
      ...this.previousTransform,
      ...this.previousInverseTransform,
      ...this.size,
      0.0, //padding for 4 byte stride
      ...this.atlasLocation,
      0.0, //padding for 4 byte stride
    ];
  }
}
