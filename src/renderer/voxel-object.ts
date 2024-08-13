import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { BoundingBox } from "./bvh";
import { MovableObject } from "./movable-object";
import { Component } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";

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

export class VoxelObject extends Component {
  /** Size of the object in voxels */
  size: Vec3;
  /** Location in the texture volume atlas */
  atlasLocation: Vec3;
  /** Index of the palette in the palette texture */
  paletteIndex: number;
  /** Index of the object in the octree buffer */
  octreeBufferIndex: number;

  constructor({
    size,
    atlasLocation,
    paletteIndex,
    octreeBufferIndex,
  }: {
    size: Vec3;
    atlasLocation: Vec3;
    paletteIndex: number;
    octreeBufferIndex: number;
  }) {
    super();
    this.size = size;
    this.atlasLocation = atlasLocation;
    this.paletteIndex = paletteIndex;
    this.octreeBufferIndex = octreeBufferIndex;
  }
}

export const getVoxelObjectBoundingBox = (
  voxelObject: VoxelObject,
  transform: Transform,
) => {
  const objectSpaceCorners = [
    vec3.create(0, 0, 0),
    vec3.create(0, 0, voxelObject.size[2]),
    vec3.create(0, voxelObject.size[1], 0),
    vec3.create(0, voxelObject.size[1], voxelObject.size[2]),
    vec3.create(voxelObject.size[0], 0, 0),
    vec3.create(voxelObject.size[0], 0, voxelObject.size[2]),
    vec3.create(voxelObject.size[0], voxelObject.size[1], 0),
    vec3.create(voxelObject.size[0], voxelObject.size[1], voxelObject.size[2]),
  ];

  const worldSpaceCorners = objectSpaceCorners.map((corner) => {
    return vec3.transformMat4(corner, transform.transform);
  });

  return getBoundingBox(worldSpaceCorners);
};

export const voxelObjectToArray = (
  voxelObject: VoxelObject,
  transform: Transform,
) => {
  console.log(transform.previousTransform);
  return [
    ...transform.transform,
    ...mat4.invert(transform.transform),
    ...transform.previousTransform,
    ...mat4.invert(transform.previousTransform),
    ...voxelObject.size,
    0.0, //padding for 4 byte stride
    ...voxelObject.atlasLocation,
    // 0.0, //padding for 4 byte stride
    voxelObject.paletteIndex,
    0.0, //padding for 4 byte stride
    0.0, //padding for 4 byte stride
    0.0, //padding for 4 byte stride
    voxelObject.octreeBufferIndex,
  ];
};
