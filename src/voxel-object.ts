import { mat4, Mat4, vec3, Vec3 } from "wgpu-matrix";
import { v4 as uuidv4 } from "uuid";
import { BoundingBox } from "./bvh";

/**
 * Get the bounding box of a set of corners
 * @param corners
 */
const getBoundingBox = (corners: Vec3[]): BoundingBox => {
  let min = vec3.create(Infinity, Infinity, Infinity);
  let max = vec3.create(-Infinity, -Infinity, -Infinity);
  for (const corner of corners) {
    min = vec3.min(min, corner);
    max = vec3.max(max, corner);
  }
  return { min, max };
};

/**
 * A class representing a voxel object in the scene.
 *
 * This does not include the actual voxel data, but rather the object's transform, size, and atlas location.
 *
 * Actual voxel data is stored in the {@link VolumeAtlas}.
 * @example
 * const transform = mat4.create();
 * const size = vec3.create(1, 1, 1);
 * const atlasLocation = vec3.create(0, 0, 0);
 * const name = "cube";
 * const cubeObject = new VoxelObject(transform, size, atlasLocation, name);
 */
export class VoxelObject {
  /** A uuid identifier for this object */
  id: string;
  /** A human readable name for this object */
  name: string;
  /** Model transform matrix */
  transform: Mat4;
  /** Inverse of the model transform matrix */
  inverseTransform: Mat4;
  /** Previous frame's model transform matrix */
  previousTransform: Mat4;
  /** Previous frame's inverse of the model transform matrix */
  previousInverseTransform: Mat4;
  /** Size of the object in voxels */
  size: Vec3;
  /** Location in the texture volume atlas */
  atlasLocation: Vec3;
  /** The center of the object in world space */
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

  get objectSpaceCorners() {
    return [
      vec3.create(0, 0, 0),
      vec3.create(0, 0, this.size[2]),
      vec3.create(0, this.size[1], 0),
      vec3.create(0, this.size[1], this.size[2]),
      vec3.create(this.size[0], 0, 0),
      vec3.create(this.size[0], 0, this.size[2]),
      vec3.create(this.size[0], this.size[1], 0),
      vec3.create(this.size[0], this.size[1], this.size[2]),
    ];
  }

  get worldSpaceCorners() {
    return this.objectSpaceCorners.map((corner) => {
      return vec3.transformMat4(corner, this.transform);
    });
  }

  /** Gets an axis aligned bounding box for the object in world space */
  get AABB() {
    return getBoundingBox(this.worldSpaceCorners);
  }

  /** Gets the object's transform matrix as a flat array, for usage in a gpu buffer */
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
