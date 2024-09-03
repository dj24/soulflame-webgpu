import { TVoxels } from "@renderer/convert-vxm";
import { VolumeAtlas } from "@renderer/volume-atlas";
import { Octree, octreeToArrayBuffer } from "@renderer/octree/octree";
import { VoxelObject } from "@renderer/voxel-object";
import { createNoise3D } from "simplex-noise";
const noise3D = createNoise3D();

const fractalNoise3D = (
  x: number,
  y: number,
  z: number,
  octaves: number = 3,
) => {
  let totalWeight = 0;
  let value = 0;
  for (let i = 0; i < octaves; i++) {
    const weight = 1 / (i + 1);
    totalWeight += weight;
    const scale = 1 << i;
    value += noise3D(x * scale, y * scale, z * scale) * weight;
  }
  return value / totalWeight;
};

const CHUNK_HEIGHT = 256;

function easeInQuart(x: number): number {
  return x * x * x * x;
}

function easeInCubic(x: number): number {
  return x * x * x;
}

function easeInQuad(x: number): number {
  return x * x;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export const createSineTerrain = (
  size: number,
  frequency: number,
  offset: [number, number, number],
): TVoxels => {
  console.time(`Create sine terrain`);
  const voxels: TVoxels["XYZI"] = [];
  const colours: TVoxels["RGBA"] = [];
  const grassColour = { r: 0, g: 255, b: 0, a: 0 };
  const dirtColour = { r: 139, g: 69, b: 19, a: 0 };
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < size; z++) {
        const bridgeWidth = 16;
        const bridgeHeight = 128;
        const offsetX = x + offset[0];
        const offsetY = y + offset[1];
        const offsetZ = z + offset[2];

        const isBridgePath =
          offsetZ < 32 &&
          offsetZ > 16 &&
          offsetY > bridgeHeight - 16 &&
          offsetY < bridgeHeight;

        const isBridgePillar =
          offsetY < bridgeHeight &&
          offsetZ < 32 &&
          offsetZ > 16 &&
          offsetX % (bridgeWidth * 2) > 0 &&
          offsetX % (bridgeWidth * 2) < bridgeWidth;

        if (isBridgePath || isBridgePillar) {
          colours.push({ r: 128, g: 128, b: 128, a: 0 });
          const c = colours.length - 1;
          voxels.push({ x, y, z, c });
          continue;
        }

        const n = fractalNoise3D(
          offsetX / frequency,
          offsetY / frequency,
          offsetZ / frequency,
          5,
        );
        // 0 at the y top, 1 at the bottom
        const squashFactor = y / CHUNK_HEIGHT;
        const density = easeInCubic((n + 1) / 2);
        const red = dirtColour.r * density + grassColour.r * (1 - density);
        const green = dirtColour.g * density + grassColour.g * (1 - density);
        const blue = dirtColour.b * density + grassColour.b * (1 - density);
        colours.push({ r: red, g: green, b: blue, a: 0 });
        const c = colours.length - 1;
        if (density > squashFactor && density < squashFactor + 0.05) {
          voxels.push({ x, y, z, c });
        }
      }
    }
  }
  console.timeEnd(`Create sine terrain`);
  return {
    SIZE: [size, CHUNK_HEIGHT, size],
    VOX: voxels.length,
    XYZI: voxels,
    RGBA: colours,
  };
};

export const createVoxelTerrain = async (
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
  size: number,
  position: [number, number, number],
) => {
  const frequency = 512;
  const name = `Terrain - ${position[0]}, ${position[1]}, ${position[2]}`;
  const voxels = createSineTerrain(size, frequency, position);
  console.time(`Create octree for ${name}`);
  const octree = new Octree(voxels);
  const octreeArrayBuffer = octreeToArrayBuffer(octree);
  console.timeEnd(`Create octree for ${name}`);
  await volumeAtlas.addVolume(
    name,
    [size, CHUNK_HEIGHT, size],
    octreeArrayBuffer,
  );
  const {
    size: atlasSize,
    location,
    paletteIndex,
    octreeOffset,
  } = volumeAtlas.dictionary[name];

  return new VoxelObject({
    name,
    size: atlasSize,
    atlasLocation: location,
    paletteIndex,
    octreeBufferIndex: octreeOffset,
  });
};
