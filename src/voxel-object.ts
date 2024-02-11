import { mat4, Mat4, vec3, Vec3 } from "wgpu-matrix";

export class VoxelObject {
  transform: Mat4;
  inverseTransform: Mat4;
  previousTransform: Mat4;
  previousInverseTransform: Mat4;
  size: Vec3;
  atlasLocation: Vec3;
  worldSpaceCenter: Vec3;
  worldSpaceCorners: Vec3[];

  constructor(transform: Mat4, size: Vec3, atlasLocation: Vec3) {
    this.transform = transform;
    this.size = size;
    this.inverseTransform = mat4.invert(this.transform);
    this.previousTransform = mat4.clone(this.transform);
    this.previousInverseTransform = mat4.clone(this.inverseTransform);
    this.atlasLocation = atlasLocation;
    const minBound = vec3.transformMat4(vec3.create(), this.transform);
    const maxBound = vec3.transformMat4(this.size, this.transform);
    this.worldSpaceCenter = vec3.lerp(minBound, maxBound, 0.5);

    const objectSpaceCorners = [
      [0, 0, 0],
      [0, 0, this.size[2]],
      [0, this.size[1], 0],
      [0, this.size[1], this.size[2]],
      [this.size[0], 0, 0],
      [this.size[0], 0, this.size[2]],
      [this.size[0], this.size[1], 0],
      [this.size[0], this.size[1], this.size[2]],
    ];
    this.worldSpaceCorners = objectSpaceCorners.map((corner) => {
      return vec3.transformMat4(corner, this.transform);
    });
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
