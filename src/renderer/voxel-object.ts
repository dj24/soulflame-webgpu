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
  name: string;

  constructor({
    size,
    atlasLocation,
    paletteIndex,
    octreeBufferIndex,
    name,
  }: {
    size: Vec3;
    atlasLocation: Vec3;
    paletteIndex: number;
    octreeBufferIndex: number;
    name: string;
  }) {
    super();
    this.size = size;
    this.atlasLocation = atlasLocation;
    this.paletteIndex = paletteIndex;
    this.octreeBufferIndex = octreeBufferIndex;
    this.name = name;
  }
}

export const getVoxelObjectBoundingBox = (
  voxelObject: VoxelObject,
  transform: Transform,
) => {
  const halfExtents = vec3.create(
    voxelObject.size[0] / 2,
    voxelObject.size[1] / 2,
    voxelObject.size[2] / 2,
  );
  const objectSpaceCorners = [
    vec3.create(-halfExtents[0], -halfExtents[1], -halfExtents[2]),
    vec3.create(-halfExtents[0], -halfExtents[1], halfExtents[2]),
    vec3.create(-halfExtents[0], halfExtents[1], -halfExtents[2]),
    vec3.create(-halfExtents[0], halfExtents[1], halfExtents[2]),
    vec3.create(halfExtents[0], -halfExtents[1], -halfExtents[2]),
    vec3.create(halfExtents[0], -halfExtents[1], halfExtents[2]),
    vec3.create(halfExtents[0], halfExtents[1], -halfExtents[2]),
    vec3.create(halfExtents[0], halfExtents[1], halfExtents[2]),
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
  return [
    ...transform.transform,
    ...mat4.invert(transform.transform),
    ...transform.previousTransform,
    ...mat4.invert(transform.previousTransform),
    ...voxelObject.size,
    0.0, //padding for 4 byte stride
    ...voxelObject.atlasLocation,
    voxelObject.paletteIndex,
  ];
};

export const voxelObjectToDataView = (
  voxelObject: VoxelObject,
  transform: Transform,
) => {
  const array = voxelObjectToArray(voxelObject, transform);
  const byteLength = (array.length + 1) * 4; // +1 for the octree buffer index
  const dataView = new DataView(new ArrayBuffer(byteLength));
  for (let i = 0; i < array.length - 1; i++) {
    dataView.setFloat32(i * 4, array[i], true);
  }
  dataView.setUint32(byteLength - 4, voxelObject.octreeBufferIndex, true);
  return dataView;
};

export const dataViewToVoxelObject = (dataView: DataView): VoxelObject => {
  const transform = mat4.create();
  const previousTransform = mat4.create();
  const size = vec3.create();
  const atlasLocation = vec3.create();
  const paletteIndex = dataView.getUint32(48, true);
  const octreeBufferIndex = dataView.getUint32(52, true);
  for (let i = 0; i < 16; i++) {
    transform[i] = dataView.getFloat32(i * 4, true);
    previousTransform[i] = dataView.getFloat32((i + 16) * 4, true);
  }
  for (let i = 32; i < 35; i++) {
    size[i - 32] = dataView.getFloat32(i * 4, true);
  }
  for (let i = 35; i < 38; i++) {
    atlasLocation[i - 35] = dataView.getFloat32(i * 4, true);
  }
  return new VoxelObject({
    size,
    atlasLocation,
    paletteIndex,
    octreeBufferIndex,
    name: "",
  });
};
