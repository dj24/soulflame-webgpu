import { vec3, Vec3 } from "wgpu-matrix";
import { BoundingBox } from "./bvh";
import { MovableObject } from "./movable-object";

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
export class VoxelObject extends MovableObject {
  /** A unique identifier for this object */
  #id: Symbol;
  /** A readable name for this object */
  #name: string;
  /** Size of the object in voxels */
  #size: Vec3;
  /** Location in the texture volume atlas */
  #atlasLocation: Vec3;
  /** Index of the palette in the palette texture */
  #paletteIndex: number;
  /** Index of the object in the octree buffer */
  #octreeBufferIndex: number;

  constructor({
    position,
    rotation,
    scale,
    size,
    atlasLocation,
    name = "unnamed",
    paletteIndex,
    octreeBufferIndex,
  }: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
    size: Vec3;
    atlasLocation: Vec3;
    name: string;
    paletteIndex: number;
    octreeBufferIndex: number;
  }) {
    super({
      position,
      rotation,
      scale,
    });
    this.#id = Symbol();
    this.#name = name;
    this.#size = size;
    this.#atlasLocation = atlasLocation;
    this.#paletteIndex = paletteIndex;
    this.#octreeBufferIndex = octreeBufferIndex;
  }

  get objectSpaceCorners() {
    return [
      vec3.create(0, 0, 0),
      vec3.create(0, 0, this.#size[2]),
      vec3.create(0, this.#size[1], 0),
      vec3.create(0, this.#size[1], this.#size[2]),
      vec3.create(this.#size[0], 0, 0),
      vec3.create(this.#size[0], 0, this.#size[2]),
      vec3.create(this.#size[0], this.#size[1], 0),
      vec3.create(this.#size[0], this.#size[1], this.#size[2]),
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

  get size() {
    return this.#size;
  }

  /** Gets the object's transform matrix as a flat array, for usage in a gpu buffer */
  toArray() {
    return [
      ...this.transform,
      ...this.inverseTransform,
      ...this.previousTransform,
      ...this.previousInverseTransform,
      ...this.#size,
      0.0, //padding for 4 byte stride
      ...this.#atlasLocation,
      // 0.0, //padding for 4 byte stride
      this.#paletteIndex,
      0.0, //padding for 4 byte stride
      0.0, //padding for 4 byte stride
      0.0, //padding for 4 byte stride
      this.#octreeBufferIndex,
    ];
  }
}
