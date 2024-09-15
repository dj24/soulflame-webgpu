import { encodeMorton, decodeMorton, computeChildMorton } from "./morton";

test("can encode and decode morton code", () => {
  const morton = encodeMorton(1, 2, 3);
  const decoded = decodeMorton(morton);
  expect(decoded).toEqual([1, 2, 3]);
});

test("2x2x2 grid is encoded correctly", () => {
  const gridCells = [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 1],
    [1, 0, 0],
    [1, 0, 1],
    [1, 1, 0],
    [1, 1, 1],
  ];

  const mortonCodes = gridCells.map(([x, y, z]) => encodeMorton(x, y, z));

  expect(mortonCodes).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

describe("child morton codes", () => {
  const morton = encodeMorton(1, 0, 0);
  test("child 0 morton code is correct", () => {
    const childMorton = computeChildMorton(morton, 0);
    const decoded = decodeMorton(childMorton);
    expect(decoded).toEqual([2, 0, 0]);
  });

  test("child 1 morton code is correct", () => {
    const childMorton = computeChildMorton(morton, 1);
    const decoded = decodeMorton(childMorton);
    expect(decoded).toEqual([3, 0, 0]);
  });

  test("child 2 morton code is correct", () => {
    const childMorton = computeChildMorton(morton, 2);
    const decoded = decodeMorton(childMorton);
    expect(decoded).toEqual([2, 1, 0]);
  });
});
