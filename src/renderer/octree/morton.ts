/**
 * Morton encoding/decoding
 * [0,0,0] -> 0
 * [0,0,1] -> 1
 * [0,1,0] -> 2
 * [0,1,1] -> 3
 * [1,0,0] -> 4
 * [1,0,1] -> 5
 * [1,1,0] -> 6
 * [1,1,1] -> 7
 */

export const encodeMorton = (x: number, y: number, z: number) => {
  let morton = 0;
  for (let i = 0; i < 10; i++) {
    morton |=
      ((x & 1) << (3 * i)) |
      ((y & 1) << (3 * i + 1)) |
      ((z & 1) << (3 * i + 2));
    x >>= 1;
    y >>= 1;
    z >>= 1;
  }
  return morton;
};

export const decodeMorton = (morton: number) => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < 10; i++) {
    x |= (morton & (1 << (3 * i))) >> i;
    y |= (morton & (1 << (3 * i + 1))) >> (i + 1);
    z |= (morton & (1 << (3 * i + 2))) >> (i + 2);
  }
  return [x, y, z];
};

// given 8 octants, return the morton code of the child octant
export const computeChildMorton = (
  parentMorton: number,
  childIndex: number,
) => {
  return (parentMorton << 3) | childIndex;
};
