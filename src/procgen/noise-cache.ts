import { Vec3 } from "wgpu-matrix";

export const convert3DTo1D = (
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
    this.size = size;
    this.noiseFunction = noiseFn;
    this.cache = new Int16Array(size[0] * size[1] * size[2]);
    for (let x = 0; x < size[0]; x++) {
      for (let y = 0; y < size[1]; y++) {
        for (let z = 0; z < size[2]; z++) {
          const index = convert3DTo1D(size, [x, y, z]);
          this.cache[index] = convertFloat32ToInt16(noiseFn(x, y, z));
        }
      }
    }
  }

  get buffer() {
    return this.cache.buffer;
  }

  get([x, y, z]: [number, number, number]): number {
    const index = convert3DTo1D(this.size, [x, y, z]);
    // const value = this.cache[index];
    // if (value === 0) {
    //   this.cache[index] = convertFloat32ToInt16(this.noiseFunction(x, y, z));
    // }
    return convertInt16ToFloat32(this.cache[index]);
  }
}

export class NoiseCache2D {
  private readonly cache: Int16Array;
  private readonly size: [number, number];
  private readonly noiseFunction: (x: number, y: number) => number;

  constructor(
    noiseFn: (x: number, y: number) => number,
    size: [number, number],
  ) {
    this.size = size;
    this.noiseFunction = noiseFn;
    this.cache = new Int16Array(size[0] * size[1]);
    for (let x = 0; x < size[0]; x++) {
      for (let y = 0; y < size[1]; y++) {
        const index = x + y * size[0];
        this.cache[index] = convertFloat32ToInt16(noiseFn(x, y));
      }
    }
  }

  get buffer() {
    return this.cache.buffer;
  }

  get([x, y]: [number, number]): number {
    const index = x + y * this.size[0];
    return convertInt16ToFloat32(this.cache[index]);
  }
}
