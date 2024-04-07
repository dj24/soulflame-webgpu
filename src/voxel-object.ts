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

  getObjectSpaceBrickCorners(brickIndex: Vec3) {
    const brickSize = vec3.create(
      BRICK_SIZE_VOXELS,
      BRICK_SIZE_VOXELS,
      BRICK_SIZE_VOXELS,
    );
    const brickOffset = vec3.multiply(brickIndex, brickSize);
    return [
      vec3.add(brickOffset, vec3.create(0, 0, 0)),
      vec3.add(brickOffset, vec3.create(0, 0, brickSize[2])),
      vec3.add(brickOffset, vec3.create(0, brickSize[1], 0)),
      vec3.add(brickOffset, vec3.create(0, brickSize[1], brickSize[2])),
      vec3.add(brickOffset, vec3.create(brickSize[0], 0, 0)),
      vec3.add(brickOffset, vec3.create(brickSize[0], 0, brickSize[2])),
      vec3.add(brickOffset, vec3.create(brickSize[0], brickSize[1], 0)),
      vec3.add(
        brickOffset,
        vec3.create(brickSize[0], brickSize[1], brickSize[2]),
      ),
    ];
  }

  get worldSpaceCorners() {
    return this.objectSpaceCorners.map((corner) => {
      return vec3.transformMat4(corner, this.transform);
    });
  }

  getBrickWorldSpaceCorners(brickIndex: Vec3) {
    return this.getObjectSpaceBrickCorners(brickIndex).map((corner) => {
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

  getBrickAABB(brickIndex: Vec3) {
    const corners = this.getBrickWorldSpaceCorners(brickIndex);
    let min = vec3.create(Infinity, Infinity, Infinity);
    let max = vec3.create(-Infinity, -Infinity, -Infinity);
    for (const corner of corners) {
      min = vec3.min(min, corner);
      max = vec3.max(max, corner);
    }
    return { min, max };
  }

  get brickAABBs() {
    const bricksX = Math.ceil(this.size[0] / BRICK_SIZE_VOXELS);
    const bricksY = Math.ceil(this.size[1] / BRICK_SIZE_VOXELS);
    const bricksZ = Math.ceil(this.size[2] / BRICK_SIZE_VOXELS);

    let brickAABBs = [];
    for (let x = 0; x < bricksX; x++) {
      for (let y = 0; y < bricksY; y++) {
        for (let z = 0; z < bricksZ; z++) {
          brickAABBs.push(this.getBrickAABB(vec3.create(x, y, z)));
        }
      }
    }

    return brickAABBs;
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
