import { Mat4 } from "wgpu-matrix";

function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result = result + f * (i % base);
    i = Math.floor(i / base);
    f = f / base;
  }
  return result;
}

export function generateJitter(
  frameIndex: number,
  viewportWidth: number,
  viewportHeight: number,
  fov: number,
  aspectRatio: number,
  nearPlane: number,
): [number, number] {
  const frustumHeight = 2 * Math.tan(fov / 2) * nearPlane;
  const frustumWidth = frustumHeight * aspectRatio;

  const jitterScaleX = 2.0 / viewportWidth;
  const jitterScaleY = 2.0 / viewportHeight;

  const jitterX = (halton(frameIndex, 2) - 0.5) * jitterScaleX * frustumWidth;
  const jitterY = (halton(frameIndex, 3) - 0.5) * jitterScaleY * frustumHeight;

  return [0, 0];
  // return [jitterX, jitterY];
}

export function jitterProjectionMatrix(
  projectionMatrix: Mat4,
  jitter: [number, number],
): Float32Array {
  const jitteredMatrix = new Float32Array(projectionMatrix);
  jitteredMatrix[8] += jitter[0]; // projectionMatrix[2][0] in column-major order
  jitteredMatrix[9] += jitter[1]; // projectionMatrix[2][1] in column-major order
  return jitteredMatrix;
}
