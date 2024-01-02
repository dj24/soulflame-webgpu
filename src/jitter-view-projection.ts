import { haltonSequence } from "./halton-sequence";
import { resolution } from "./app";
import { Mat4, mat4, vec3 } from "wgpu-matrix";

export const haltonJitter = (frameNumber: number, viewMatrix: Mat4): Mat4 => {
  const jitterIndex = frameNumber % 8;
  const haltonX = 2 * haltonSequence(jitterIndex + 1, 2) - 1;
  const haltonY = 2 * haltonSequence(jitterIndex + 1, 3) - 1;
  const jitterX = haltonX / resolution[0];
  const jitterY = haltonY / resolution[1];
  const jitterAmount = 1;
  const newJitterAmount = vec3.mulScalar(
    vec3.create(jitterX, jitterY, 0),
    jitterAmount,
  );
  const jitterOffsetMatrix = mat4.translate(mat4.identity(), newJitterAmount);
  return mat4.mul(viewMatrix, jitterOffsetMatrix);
};
