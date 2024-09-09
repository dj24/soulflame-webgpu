export function easeInCubic(x: number): number {
  return x * x * x;
}

export function easeInCirc(x: number): number {
  return 1 - Math.sqrt(1 - Math.pow(x, 2));
}

export function easeOutCirc(x: number): number {
  return Math.sqrt(1 - Math.pow(x - 1, 2));
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
