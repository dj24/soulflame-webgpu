import { Vec3 } from "wgpu-matrix";

export const getCuboidVertices = (size: Vec3) => {
  const [x, y, z] = [size[0] / 2, size[1] / 2, size[2] / 2];

  const bottomLeftBack = [-x, -y, -z, 1];
  const bottomRightBack = [x, -y, -z, 1];
  const topLeftBack = [-x, y, -z, 1];
  const topRightBack = [x, y, -z, 1];
  const bottomLeftFront = [-x, -y, z, 1];
  const bottomRightFront = [x, -y, z, 1];
  const topLeftFront = [-x, y, z, 1];
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
