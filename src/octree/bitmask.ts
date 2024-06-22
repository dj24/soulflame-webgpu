export const setBit = (bitmask: number, index: number) => {
  return bitmask | (1 << index);
};

export const setBitLE = (bitmask: number, index: number) => {
  return bitmask | (1 << (7 - index));
};

export const clearBit = (bitmask: number, index: number) => {
  return bitmask & ~(1 << index);
};

export const getBit = (bitmask: number, index: number) => {
  return (bitmask & (1 << index)) !== 0;
};
