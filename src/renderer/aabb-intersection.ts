import { Vec3 } from "wgpu-matrix";

type IntersectionResult = {
  tNear: number;
  tFar: number;
  hit: boolean;
};

/** Tests if a ray intersects with an axis-aligned bounding box. Box position will always be at (0,0,0) */
export const AABBIntersection = (
  rayDirection: Vec3,
  rayOrigin: Vec3,
  boxSize: Vec3,
): IntersectionResult => {
  let m = [
    Math.min(1.0 / rayDirection[0], Number.MAX_VALUE),
    Math.min(1.0 / rayDirection[1], Number.MAX_VALUE),
    Math.min(1.0 / rayDirection[2], Number.MAX_VALUE),
  ];
  let n = [m[0] * rayOrigin[0], m[1] * rayOrigin[1], m[2] * rayOrigin[2]];
  let k = [
    Math.abs(m[0]) * boxSize[0],
    Math.abs(m[1]) * boxSize[1],
    Math.abs(m[2]) * boxSize[2],
  ];
  let t1 = [-k[0] - n[0], -k[1] - n[1], -k[2] - n[2]];
  let t2 = [k[0] - n[0], k[1] - n[1], k[2] - n[2]];
  let tNear = Math.max(Math.max(t1[0], t1[1]), t1[2]);
  let tFar = Math.min(Math.min(t2[0], t2[1]), t2[2]);

  if (tNear > tFar || tFar < 0.0) {
    return {
      tNear: -1,
      tFar: -1,
      hit: false,
    };
  }

  return {
    tNear,
    tFar,
    hit: true,
  };
};

export const translatedAABBIntersection = (
  rayDirection: Vec3,
  rayOrigin: Vec3,
  boxSize: Vec3,
  boxPosition: Vec3,
): IntersectionResult => {
  let translatedRayOrigin = [
    rayOrigin[0] - boxPosition[0],
    rayOrigin[1] - boxPosition[1],
    rayOrigin[2] - boxPosition[2],
  ];
  return AABBIntersection(rayDirection, translatedRayOrigin, boxSize);
};
