export function haltonSequence(index: number, base: number): number {
  let f = 1;
  let r = 0;

  while (index > 0) {
    f /= base;
    r += f * (index % base);
    index = Math.floor(index / base);
  }

  return r;
}
