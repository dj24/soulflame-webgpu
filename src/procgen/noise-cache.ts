import { Vec3 } from "wgpu-matrix";

const convert3DTo1D = (
  size: [number, number, number] | Vec3,
  position: [number, number, number] | Vec3,
) => {
  return (
    position[0] + position[1] * size[0] + position[2] * (size[0] * size[1])
  );
};

const convertFloat32ToInt16 = (value: number) => {
  return Math.floor(value * 32767);
};

const convertInt16ToFloat32 = (value: number) => {
  return value / 32767;
};

// Created a noise field for a given volume size
export class NoiseCache {
  private readonly cache: Int16Array;
  private readonly size: [number, number, number];
  private readonly noiseFunction: (x: number, y: number, z: number) => number;

  constructor(
    noiseFn: (x: number, y: number, z: number) => number,
    size: [number, number, number],
  ) {
    const startTimestamp = performance.now();
    this.size = size;
    this.noiseFunction = noiseFn;
    this.cache = new Int16Array(size[0] * size[1] * size[2]);
    console.debug(
      "Noise cache",
      size,
      "created in",
      (performance.now() - startTimestamp).toFixed(0),
      "ms",
      "size",
      this.totalSizeBytes / 1024 ** 2,
      "MB",
    );
  }

  get totalSizeBytes(): number {
    return this.cache.byteLength;
  }

  get([x, y, z]: [number, number, number]): number {
    const index = convert3DTo1D(this.size, [x, y, z]);

    const value = this.cache[index];
    if (value === 0) {
      this.cache[index] = convertFloat32ToInt16(this.noiseFunction(x, y, z));
    }

    return convertInt16ToFloat32(this.cache[index]);
  }
}
