import seedrandom from "seedrandom";
import { createNoise3D } from "simplex-noise";

export const myrng = seedrandom("crystals");
const noise3D = createNoise3D(myrng);

export const fractalNoise3D = (
  x: number,
  y: number,
  z: number,
  frequency: number = 1,
  octaves: number = 3,
  persistence: number = 0.5, // controls amplitude scaling between octaves
) => {
  let totalWeight = 0;
  let value = 0;
  let amplitude = 1;

  for (let i = 0; i < octaves; i++) {
    const scale = 1 << i; // scale doubles each octave
    value +=
      noise3D(
        x * scale * frequency,
        y * scale * frequency,
        z * scale * frequency,
      ) * amplitude;
    totalWeight += amplitude;
    amplitude *= persistence; // reduce amplitude for each octave
  }

  return value / totalWeight; // normalize the result
};

export const ridgedFractalNoise3D = (
  x: number,
  y: number,
  z: number,
  octaves: number = 3,
  persistence: number = 0.5,
) => {
  let totalWeight = 0;
  let value = 0;
  let amplitude = 1;

  for (let i = 0; i < octaves; i++) {
    const scale = 1 << i;
    value += Math.abs(noise3D(x * scale, y * scale, z * scale)) * amplitude;
    totalWeight += amplitude;
    amplitude *= persistence;
  }

  return value / totalWeight;
};
