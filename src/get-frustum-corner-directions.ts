import { Camera } from "./camera";
import { camera, resolution } from "./app";
import { Vec3, vec3 } from "wgpu-matrix";

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
  const topLeft = vec3.create(-nearWidth / 2, nearHeight / 2, -camera.near); //0, Near Top Left
  const topRight = vec3.create(nearWidth / 2, nearHeight / 2, -camera.near); //1, Near Top Right
  const bottomRight = vec3.create(nearWidth / 2, -nearHeight / 2, -camera.near); //2, Near Bottom Right
  const bottomLeft = vec3.create(-nearWidth / 2, -nearHeight / 2, -camera.near); //3, Near Bottom Left
  return [topLeft, topRight, bottomLeft, bottomRight];
};

const getNearPlaneWorldSpaceCornerPositions = (camera: Camera): Corners => {
  const corners = getNearPlaneCornerPositions(camera);
  return [
    vec3.transformMat4(corners[0], camera.viewMatrix),
    vec3.transformMat4(corners[1], camera.viewMatrix),
    vec3.transformMat4(corners[2], camera.viewMatrix),
    vec3.transformMat4(corners[3], camera.viewMatrix),
  ];
};

const getClipSpaceFrustumCornerDirections = (camera: Camera): Corners => {
  const corners = getNearPlaneCornerPositions(camera);
  console.log({ corners });
  return [
    vec3.normalize(vec3.add(corners[0], vec3.zero())),
    vec3.normalize(vec3.add(corners[1], vec3.zero())),
    vec3.normalize(vec3.add(corners[2], vec3.zero())),
    vec3.normalize(vec3.add(corners[3], vec3.zero())),
  ];
};

export const getFrustumCornerDirections = (camera: Camera): Corners => {
  const corners = getClipSpaceFrustumCornerDirections(camera);
  return corners;
  // TODO: fix this
  return [
    vec3.transformMat4(corners[0], camera.viewMatrix),
    vec3.transformMat4(corners[1], camera.viewMatrix),
    vec3.transformMat4(corners[2], camera.viewMatrix),
    vec3.transformMat4(corners[3], camera.viewMatrix),
  ];
};
