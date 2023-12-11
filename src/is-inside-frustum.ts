import { mat4, Mat4, vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";

export const isInsideFrustum = ({
  viewProjectionMatrix,
  voxelObject,
}: {
  viewProjectionMatrix: Mat4;
  voxelObject: VoxelObject;
}) => {
  const { minBound, maxBound } = voxelObject.worldSpaceBounds;

  // Transform the bounding box into clip space
  const corners = [
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(minBound[0], minBound[1], minBound[2]),
    ),
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(maxBound[0], minBound[1], minBound[2]),
    ),
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(minBound[0], maxBound[1], minBound[2]),
    ),
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(maxBound[0], maxBound[1], minBound[2]),
    ),
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(minBound[0], minBound[1], maxBound[2]),
    ),
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(maxBound[0], minBound[1], maxBound[2]),
    ),
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(minBound[0], maxBound[1], maxBound[2]),
    ),
    vec3.transformMat4(
      viewProjectionMatrix,
      vec3.create(maxBound[0], maxBound[1], maxBound[2]),
    ),
  ];

  // Check if any of the corners are inside the frustum
  for (const corner of corners) {
    if (
      corner[0] >= -1 &&
      corner[0] <= 1 &&
      corner[1] >= -1 &&
      corner[1] <= 1 &&
      corner[2] >= -1 &&
      corner[2] <= 1
    ) {
      // At least one corner is inside the frustum
      return true;
    }
  }

  // The bounding box is at least partially inside the frustum
  return false;
};
