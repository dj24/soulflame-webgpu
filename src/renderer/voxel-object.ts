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
  /** Index of the object in the octree buffer */
  octreeBufferIndex: number;
  /** Name of the object */
  name: string;
  /** Uncompressed array buffer containing octree */
  uncompressedArrayBuffer: SharedArrayBuffer | null;
  /** Size in bytes of the compressed array buffer */
  sizeInBytes: number;

  constructor({
    size,
    octreeBufferIndex,
    name,
    uncompressedArrayBuffer,
    sizeInBytes,
  }: {
    size: Vec3;
    octreeBufferIndex: number;
    name: string;
    uncompressedArrayBuffer: SharedArrayBuffer | null;
    sizeInBytes: number;
  }) {
    super();
    this.size = size;
    this.octreeBufferIndex = octreeBufferIndex;
    this.name = name;
    this.uncompressedArrayBuffer = uncompressedArrayBuffer;
    this.sizeInBytes = sizeInBytes;
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

export const voxelObjectToDataView = (
  voxelObject: VoxelObject,
  transform: Transform,
) => {
  const size = voxelObject.size;
  const dataView = new DataView(new ArrayBuffer(292));
  let byteOffset = 0;
  transform.transform.forEach((value) => {
    dataView.setFloat32(byteOffset, value, true);
    byteOffset += 4;
  });
  mat4.invert(transform.transform).forEach((value) => {
    dataView.setFloat32(byteOffset, value, true);
    byteOffset += 4;
  });
  transform.previousTransform.forEach((value) => {
    dataView.setFloat32(byteOffset, value, true);
    byteOffset += 4;
  });
  mat4.invert(transform.previousTransform).forEach((value) => {
    dataView.setFloat32(byteOffset, value, true);
    byteOffset += 4;
  });
  [size[0], size[1], size[2]].forEach((value) => {
    dataView.setFloat32(byteOffset, value, true);
    byteOffset += 4;
  });
  byteOffset += 4; // Align to 16 bytes
  byteOffset += 16; // Skip the atlasLocation
  dataView.setUint32(byteOffset, voxelObject.octreeBufferIndex, true);
  return dataView;
};
