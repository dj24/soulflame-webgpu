import { Camera } from "./camera";
import { resolution } from "./app";
import { vec3 } from "wgpu-matrix";

export const getFrustumCornerDirections = (camera: Camera) => {
  const aspectRatio = resolution[0] / resolution[1];
  const halfFov = camera.fieldOfView / 2;
  const tanHalfFov = Math.tan(halfFov);
  const right = vec3.normalize(
    vec3.cross(vec3.create(0, 1, 0), camera.direction),
  );
  const up = vec3.normalize(vec3.cross(camera.direction, right));
  const upwardDisplacement = vec3.mulScalar(up, tanHalfFov);

  const topLeft = vec3.add(
    vec3.add(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, -aspectRatio * tanHalfFov),
  );
  const topRight = vec3.add(
    vec3.add(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, aspectRatio * tanHalfFov),
  );
  const bottomLeft = vec3.add(
    vec3.subtract(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, -aspectRatio * tanHalfFov),
  );
  const bottomRight = vec3.add(
    vec3.subtract(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, aspectRatio * tanHalfFov),
  );
  return [topLeft, topRight, bottomLeft, bottomRight];
};
