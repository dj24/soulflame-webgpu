// Created a noise field for a given volume size
export class NoiseCache {
  private cache: Map<string, number>;

  constructor(
    noiseFn: (x: number, y: number, z: number) => number,
    size: [number, number, number],
  ) {
    const startTimestamp = performance.now();
    this.cache = new Map();
    for (let x = 0; x < size[0]; x++) {
      for (let y = 0; y < size[1]; y++) {
        for (let z = 0; z < size[2]; z++) {
          this.cache.set(`${x}${y}${z}`, noiseFn(x, y, z));
        }
      }
    }
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
    const keySize = 3;
    const valueSize = 8;
    return this.cache.size * (keySize + valueSize);
  }

  get([x, y, z]: [number, number, number]): number {
    return this.cache.get(`${x}${y}${z}`) ?? 0.5;
  }
}
