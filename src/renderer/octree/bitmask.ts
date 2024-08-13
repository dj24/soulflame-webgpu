export const setBit = (bitmask: number, index: number) => {
  return bitmask | (1 << index);
};

export const setBitLE = (bitmask: number, index: number, totalBits = 8) => {
  return bitmask | (1 << (totalBits - 1 - index));
};

export const clearBit = (bitmask: number, index: number) => {
  return bitmask & ~(1 << index);
};

export const clearBitLE = (bitmask: number, index: number, totalBits = 8) => {
  return bitmask & ~(1 << (totalBits - 1 - index));
};

export const getBit = (bitmask: number, index: number) => {
  return (bitmask & (1 << index)) !== 0;
};

export const getBitLE = (bitmask: number, index: number) => {
  return (bitmask & (1 << (7 - index))) !== 0;
};
