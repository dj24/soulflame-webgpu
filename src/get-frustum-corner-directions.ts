import { Camera } from "./camera";
import { camera, resolution } from "./app";
import { mat4, quat, Vec3, vec3 } from "wgpu-matrix";

type Corners = [
  topLeft: Vec3,
  topRight: Vec3,
  bottomLeft: Vec3,
  bottomRight: Vec3,
];

const getNearPlaneCornerPositions = (camera: Camera): Corners => {
  const aspectRatio = resolution[0] / resolution[1];
  const nearHeight =
    2 * Math.tan(((camera.fieldOfView / 180) * Math.PI) / 2) * camera.near;
  const nearWidth = nearHeight * aspectRatio;
  const bottomLeft = vec3.create(nearWidth / 2, -nearHeight / 2, -camera.near); //0, Near Top Left
  const bottomRight = vec3.create(
    -nearWidth / 2,
    -nearHeight / 2,
    -camera.near,
  ); //1, Near Top Right
  const topRight = vec3.create(-nearWidth / 2, nearHeight / 2, -camera.near); //2, Near Bottom Right
  const topLeft = vec3.create(nearWidth / 2, nearHeight / 2, -camera.near); //3, Near Bottom Left
  return [topLeft, topRight, bottomLeft, bottomRight];
};

export const getCameraSpaceFrustumCornerDirections = (
  camera: Camera,
): Corners => {
  const corners = getNearPlaneCornerPositions(camera);
  return [
    vec3.normalize(vec3.subtract(corners[0], vec3.zero())),
    vec3.normalize(vec3.subtract(corners[1], vec3.zero())),
    vec3.normalize(vec3.subtract(corners[2], vec3.zero())),
    vec3.normalize(vec3.subtract(corners[3], vec3.zero())),
  ];
};

export const getWorldSpaceFrustumCornerDirections = (
  camera: Camera,
): Corners => {
  const cornerDirections = getCameraSpaceFrustumCornerDirections(camera);
  const rotationQuat = quat.fromMat(camera.inverseViewMatrix);
  const worldSpaceCornerDirections = [
    vec3.transformQuat(cornerDirections[0], rotationQuat),
    vec3.transformQuat(cornerDirections[1], rotationQuat),
    vec3.transformQuat(cornerDirections[2], rotationQuat),
    vec3.transformQuat(cornerDirections[3], rotationQuat),
  ];
  return worldSpaceCornerDirections as Corners;
};
