export const setBit = (bitmask: number, index: number) => {
  return bitmask | (1 << index);
};

export const getBit = (bitmask: number, index: number) => {
  return (bitmask & (1 << index)) !== 0;
};
