import { mat4, Mat4, vec3, Vec3 } from "wgpu-matrix";
import { v4 as uuidv4 } from "uuid";

const transformPointToNDC = (point: Vec3, viewProjection: Mat4) => {
  return vec3.transformMat4(point, viewProjection);
};

export const isVoxelObjectInFrustrum = (
  voxelObject: VoxelObject,
  viewProjection: Mat4,
) => {
  const isAnyCornerInFrustrum = voxelObject.worldSpaceCorners.some((corner) => {
    const ndc = transformPointToNDC(corner, viewProjection);
    return (
      ndc[0] >= -1 && ndc[0] <= 1 && ndc[1] >= -1 && ndc[1] <= 1 && ndc[2] >= 0
    );
  });
  return isAnyCornerInFrustrum;
};

export class VoxelObject {
  id: string;
  name: string;
  transform: Mat4;
  inverseTransform: Mat4;
  previousTransform: Mat4;
  previousInverseTransform: Mat4;
  size: Vec3;
  atlasLocation: Vec3;
  worldSpaceCenter: Vec3;

  constructor(
    transform: Mat4,
    size: Vec3,
    atlasLocation: Vec3,
    name = "unnamed",
  ) {
    this.id = uuidv4();
    this.name = name;
    this.transform = transform;
    this.size = size;
    this.inverseTransform = mat4.invert(this.transform);
    this.previousTransform = mat4.clone(this.transform);
    this.previousInverseTransform = mat4.clone(this.inverseTransform);
    this.atlasLocation = atlasLocation;
    const minBound = vec3.transformMat4(vec3.create(), this.transform);
    const maxBound = vec3.transformMat4(this.size, this.transform);
    this.worldSpaceCenter = vec3.lerp(minBound, maxBound, 0.5);
  }

  get worldSpaceCorners() {
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
    return objectSpaceCorners.map((corner) => {
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
