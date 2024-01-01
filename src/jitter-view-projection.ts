import { haltonSequence } from "./halton-sequence";
import { resolution } from "./app";
import { Vec2, vec2 } from "wgpu-matrix";

export const haltonJitter = (frameNumber: number): Vec2 => {
  const jitterIndex = frameNumber % 8;
  const haltonX = 2 * haltonSequence(jitterIndex + 1, 2) - 1;
  const haltonY = 2 * haltonSequence(jitterIndex + 1, 3) - 1;
  const jitterX = haltonX / resolution[0];
  const jitterY = haltonY / resolution[1];
  const jitterAmount = 1;
  return vec2.mulScalar(vec2.create(jitterX, jitterY), jitterAmount);
};
