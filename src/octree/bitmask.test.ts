import { clearBit, getBit, setBit } from "./bitmask";

test("can set bit at position 0", () => {
  expect(setBit(0, 0)).toBe(1);
});

test("can set bit at position 1", () => {
  expect(setBit(0, 1)).toBe(2);
});

test("can set bit at position 2", () => {
  expect(setBit(0, 2)).toBe(4);
});

test("can set bit at position 3", () => {
  expect(setBit(0, 3)).toBe(8);
});

test("can set bit at position 4", () => {
  expect(setBit(0, 4)).toBe(16);
});

test("can set bit at position 5", () => {
  expect(setBit(0, 5)).toBe(32);
});

test("can set bit at position 6", () => {
  expect(setBit(0, 6)).toBe(64);
});

test("can set bit at position 7", () => {
  expect(setBit(0, 7)).toBe(128);
});

test("can clear bit at position 0", () => {
  expect(clearBit(1, 0)).toBe(0);
});

test("can clear bit at position 1", () => {
  expect(clearBit(2, 1)).toBe(0);
});

test("can clear bit at position 2", () => {
  expect(clearBit(4, 2)).toBe(0);
});

test("can clear bit at position 3", () => {
  expect(clearBit(8, 3)).toBe(0);
});
