import { nextPowerOf2, calculateNumMipLevels } from "./create-3d-texture";

describe("next power of 2", () => {
  it("should return 2 for 1", () => {
    expect(nextPowerOf2(1)).toEqual(2);
  });

  it("should return 4 for 3", () => {
    expect(nextPowerOf2(3)).toEqual(4);
  });

  it("should return 4 for 4", () => {
    expect(nextPowerOf2(4)).toEqual(4);
  });

  it("should return 8 for 5", () => {
    expect(nextPowerOf2(5)).toEqual(8);
  });

  it("should return 8 for 7", () => {
    expect(nextPowerOf2(7)).toEqual(8);
  });

  it("should return 8 for 8", () => {
    expect(nextPowerOf2(8)).toEqual(8);
  });

  it("should return 16 for 9", () => {
    expect(nextPowerOf2(9)).toEqual(16);
  });
});

describe("calculate num mip levels", () => {
  it("should return 1 for [1, 1, 1]", () => {
    expect(calculateNumMipLevels([1, 1, 1])).toEqual(1);
  });

  it("should return 2 for [2, 1, 1]", () => {
    expect(calculateNumMipLevels([2, 1, 1])).toEqual(2);
  });
  it("should return 3 for [4, 1, 1]", () => {
    expect(calculateNumMipLevels([4, 1, 1])).toEqual(3);
  });
  it("should return 4 for [1, 1, 8]", () => {
    expect(calculateNumMipLevels([8, 1, 1])).toEqual(4);
  });
  it("should return 5 for [1, 16, 1]", () => {
    expect(calculateNumMipLevels([16, 1, 1])).toEqual(5);
  });
  it("should return 6 for [1, 1, 32]", () => {
    expect(calculateNumMipLevels([32, 1, 1])).toEqual(6);
  });
});
