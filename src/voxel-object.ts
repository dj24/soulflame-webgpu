import { mat4, Mat4, vec3, Vec3 } from "wgpu-matrix";
import { v4 as uuidv4 } from "uuid";

const BRICK_SIZE_VOXELS = 8;

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
      vec3.create(0, 0, 0),
      vec3.create(0, 0, this.size[2]),
      vec3.create(0, this.size[1], 0),
      vec3.create(0, this.size[1], this.size[2]),
      vec3.create(this.size[0], 0, 0),
      vec3.create(this.size[0], 0, this.size[2]),
      vec3.create(this.size[0], this.size[1], 0),
      vec3.create(this.size[0], this.size[1], this.size[2]),
    ];
    return objectSpaceCorners.map((corner) => {
      return vec3.transformMat4(corner, this.transform);
    });
  }

  get AABB() {
    let min = vec3.create(Infinity, Infinity, Infinity);
    let max = vec3.create(-Infinity, -Infinity, -Infinity);
    for (const corner of this.worldSpaceCorners) {
      min = vec3.min(min, corner);
      max = vec3.max(max, corner);
    }
    return { min, max };
  }

  get worldSpaceBrickCorners() {
    const bricksX = Math.ceil(this.size[0] / BRICK_SIZE_VOXELS);
    const bricksY = Math.ceil(this.size[1] / BRICK_SIZE_VOXELS);
    const bricksZ = Math.ceil(this.size[2] / BRICK_SIZE_VOXELS);

    let brickCorners = [];
    for (let x = 0; x < bricksX; x++) {
      for (let y = 0; y < bricksY; y++) {
        for (let z = 0; z < bricksZ; z++) {
          const min = vec3.create(
            x * BRICK_SIZE_VOXELS,
            y * BRICK_SIZE_VOXELS,
            z * BRICK_SIZE_VOXELS,
          );
          const max = vec3.create(
            (x + 1) * BRICK_SIZE_VOXELS,
            (y + 1) * BRICK_SIZE_VOXELS,
            (z + 1) * BRICK_SIZE_VOXELS,
          );
          brickCorners.push({
            min: vec3.transformMat4(min, this.transform),
            max: vec3.transformMat4(max, this.transform),
          });
        }
      }
    }
    return brickCorners;
  }

  get brickAABBs() {
    return this.worldSpaceBrickCorners.map(({ min, max }) => {
      return { min, max };
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
