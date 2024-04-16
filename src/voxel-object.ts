import { mat4, Mat4, vec3, Vec3 } from "wgpu-matrix";
import { v4 as uuidv4 } from "uuid";
import { volumeAtlas } from "./app";
import {
  decodePositionString,
  PositionString,
} from "./create-brickmap/create-brick-map-from-voxels";
import { BoundingBox } from "./bvh";

const BRICK_SIZE_VOXELS = 8;

const convert3DTo1D = (size: Vec3, position: Vec3) => {
  return (
    position[0] + position[1] * size[0] + position[2] * (size[0] * size[1])
  );
};

const getBoundingBox = (corners: Vec3[]): BoundingBox => {
  let min = vec3.create(Infinity, Infinity, Infinity);
  let max = vec3.create(-Infinity, -Infinity, -Infinity);
  for (const corner of corners) {
    min = vec3.min(min, corner);
    max = vec3.max(max, corner);
  }
  return { min, max };
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
  atlasBrickMapOffset: number;
  worldSpaceCenter: Vec3;

  constructor(
    transform: Mat4,
    size: Vec3,
    atlasLocation: Vec3,
    brickMapOffset: number,
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
    this.atlasBrickMapOffset = brickMapOffset;
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
      vec3.add(brickOffset, brickSize),
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
    return getBoundingBox(this.worldSpaceCorners);
  }

  getBrickOBB(brickIndex: Vec3): BoundingBox {
    const brickSize = vec3.create(
      BRICK_SIZE_VOXELS,
      BRICK_SIZE_VOXELS,
      BRICK_SIZE_VOXELS,
    );
    const brickOffset = vec3.multiply(brickIndex, brickSize);
    return {
      min: vec3.add(brickOffset, vec3.create(0, 0, 0)),
      max: vec3.add(brickOffset, brickSize),
    };
  }

  getNormalizedBrickOBB(brickIndex: Vec3): BoundingBox {
    const brickSize = vec3.create(
      BRICK_SIZE_VOXELS,
      BRICK_SIZE_VOXELS,
      BRICK_SIZE_VOXELS,
    );
    const brickOBB = this.getBrickOBB(brickIndex);
    const normalizedMin = vec3.divide(brickOBB.min, this.size);
    const normalizedMax = vec3.divide(brickOBB.max, this.size);
    return {
      min: normalizedMin,
      max: normalizedMax,
    };
  }

  get normalizedBrickOBBs() {
    const brickMap = volumeAtlas.getVolumes()[this.name].brickMap;
    let brickOBBs: BoundingBox[] = [];
    Object.entries(brickMap).forEach(([key, value]) => {
      const position = decodePositionString(key as PositionString);
      brickOBBs.push(this.getNormalizedBrickOBB(position));
    });
    return brickOBBs;
  }

  getBrickAABB(brickIndex: Vec3): BoundingBox {
    return getBoundingBox(this.getBrickWorldSpaceCorners(brickIndex));
  }

  get brickOBBs() {
    const brickMap = volumeAtlas.getVolumes()[this.name].brickMap;
    let brickOBBs: BoundingBox[] = [];
    Object.entries(brickMap).forEach(([key, value]) => {
      const position = decodePositionString(key as PositionString);
      brickOBBs.push(this.getBrickOBB(position));
    });
    console.log({ brickOBBs });
    return brickOBBs;
  }

  get brickAABBs() {
    const brickMap = volumeAtlas.getVolumes()[this.name].brickMap;
    let brickAABBs: BoundingBox[] = [];
    Object.entries(brickMap).forEach(([key, value]) => {
      const position = decodePositionString(key as PositionString);
      brickAABBs.push(this.getBrickAABB(position));
    });
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

  toDataView() {
    const floats = this.toArray();
    const buffer = new ArrayBuffer(floats.length * 4 + 4);
    const view = new DataView(buffer);
    for (let i = 0; i < floats.length; i++) {
      view.setFloat32(i * 4, floats[i], true);
    }
    view.setUint32(floats.length * 4, this.atlasBrickMapOffset, true);
    return view;
  }
}
