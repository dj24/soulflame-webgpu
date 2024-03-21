import { Vec3 } from "wgpu-matrix";

export const getCuboidVertices = (size: Vec3) => {
  const [x, y, z] = size;

  const bottomLeftBack = [0, 0, 0, 1];
  const bottomRightBack = [x, 0, 0, 1];
  const topLeftBack = [0, y, 0, 1];
  const topRightBack = [x, y, 0, 1];
  const bottomLeftFront = [0, 0, z, 1];
  const bottomRightFront = [x, 0, z, 1];
  const topLeftFront = [0, y, z, 1];
  const topRightFront = [x, y, z, 1];

  let backFace = [
    bottomLeftBack,
    bottomRightBack,
    topLeftBack,
    topLeftBack,
    bottomRightBack,
    topRightBack,
  ].flat();

  let frontFace = [
    bottomLeftFront,
    topLeftFront,
    bottomRightFront,
    bottomRightFront,
    topLeftFront,
    topRightFront,
  ].flat();

  let topFace = [
    topLeftBack,
    topRightBack,
    topLeftFront,
    topLeftFront,
    topRightBack,
    topRightFront,
  ].flat();

  let bottomFace = [
    bottomLeftBack,
    bottomLeftFront,
    bottomRightBack,
    bottomRightBack,
    bottomLeftFront,
    bottomRightFront,
  ].flat();

  let rightFace = [
    bottomRightBack,
    bottomRightFront,
    topRightBack,
    topRightBack,
    bottomRightFront,
    topRightFront,
  ].flat();

  let leftFace = [
    bottomLeftBack,
    topLeftBack,
    bottomLeftFront,
    bottomLeftFront,
    topLeftBack,
    topLeftFront,
  ].flat();

  return new Float32Array([
    ...backFace,
    ...frontFace,
    ...topFace,
    ...bottomFace,
    ...rightFace,
    ...leftFace,
  ]);
};
