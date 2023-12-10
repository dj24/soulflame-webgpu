import { mat4, Mat4, quat, Quat, vec3, Vec3 } from "wgpu-matrix";

export const interpolateMatrix = (a: Mat4, b: Mat4, progress: number) => {
  let aTranslation: Vec3;
  mat4.getTranslation(a, aTranslation);
  let bTranslation: Vec3;
  mat4.getTranslation(b, bTranslation);
  const interpolatedTranslation = vec3.lerp(
    aTranslation,
    bTranslation,
    progress,
  );

  let aScale: Vec3;
  mat4.getScaling(a, aScale);
  let bScale: Vec3;
  mat4.getScaling(b, bScale);
  const interpolatedScale = vec3.lerp(aScale, bScale, progress);

  let aRotation: Quat;
  quat.fromMat(a, aRotation);
  let bRotation: Quat;
  quat.fromMat(b, bRotation);
  const interpolatedRotation = quat.slerp(aRotation, bRotation, progress);

  const interpolatedMatrix = mat4.identity();
  mat4.translate(
    interpolatedMatrix,
    interpolatedTranslation,
    interpolatedMatrix,
  );
  mat4.fromQuat(interpolatedRotation, interpolatedMatrix);
  mat4.scale(interpolatedMatrix, interpolatedScale, interpolatedMatrix);
  return interpolatedMatrix;
};
