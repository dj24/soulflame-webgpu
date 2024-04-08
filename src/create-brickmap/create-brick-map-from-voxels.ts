import { vec3, Vec3 } from "wgpu-matrix";
import { TVoxels } from "../convert-vxm";

// 512 bits per brick, 64 bytes
type Brick = Uint32Array;

export type PositionString = `${number},${number},${number}`;

export const decodePositionString = (positionString: PositionString): Vec3 => {
  const [x, y, z] = positionString.split(",").map(Number);
  return vec3.create(x, y, z);
};

export type BrickMap = {
  [key: PositionString]: Brick;
};

// Set a bit in a 4-byte (32bit) number.
export const setBit = (
  fourBytes: number,
  bitIndex: number,
  bit: boolean,
): number => {
  let mask = 1 << bitIndex;
  if (bit) {
    return fourBytes | mask;
  } else {
    return fourBytes & ~mask;
  }
};

// Set a bit in a 512-bit brick.
export const setBitInBrick = (
  brick: Brick,
  bitIndex: number,
  bit: boolean,
): Brick => {
  const byteIndex = Math.floor(bitIndex / 32);
  const bitIndexInByte = bitIndex % 32;
  brick[byteIndex] = setBit(brick[byteIndex], bitIndexInByte, bit);
  return brick;
};

/**
 * Create a brickmap for the given voxels.
 * Bricks contain a bitmask for 8x8x8 voxels each.
 * Only returns bricks that contain at least one voxel.
 * @param voxels
 */
export const createBrickMapFromVoxels = (voxels: TVoxels) => {
  const brickMap: BrickMap = {};

  for (let i = 0; i < voxels.XYZI.length; i++) {
    const voxel = voxels.XYZI[i];
    const brickPosition = vec3.create(
      Math.floor(voxel.x / 8),
      Math.floor(voxel.y / 8),
      Math.floor(voxel.z / 8),
    );
    const brickKey: PositionString = `${brickPosition[0]},${brickPosition[1]},${brickPosition[2]}`;
    if (!brickMap[brickKey]) {
      brickMap[brickKey] = new Uint32Array(16);
    }

    const bitIndex = (voxel.x % 8) + (voxel.y % 8) * 8 + (voxel.z % 8) * 64;
    brickMap[brickKey] = setBitInBrick(brickMap[brickKey], bitIndex, true);
  }

  return brickMap;
};
