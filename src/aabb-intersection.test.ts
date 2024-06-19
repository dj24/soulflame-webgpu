import {
  AABBIntersection,
  translatedAABBIntersection,
} from "./aabb-intersection";

test("ray at (0,0,-1) and direction (0,0,1) intersects with box of size (1,1,1)", () => {
  const intersection = AABBIntersection([0, 0, 1], [0, 0, 0], [1, 1, 1]);
  expect(intersection.hit).toBe(true);
});

test("ray at (0,0,-1) and direction (0,0,-1) does not intersect with box of size (1,1,1)", () => {
  const intersection = AABBIntersection([0, 0, -1], [0, 0, -2], [1, 1, 1]);
  expect(intersection.hit).toBe(false);
});

test("ray at (-5,0,0) and direction (0,0,1) does not intersect with box of size (1,1,1)", () => {
  const intersection = AABBIntersection([0, 0, 1], [-5, 0, 0], [1, 1, 1]);
  expect(intersection.hit).toBe(false);
});

test("ray at (0,0,-1) and direction (0,0,1) intersects with box of size (1,1,1) translated to (0,0,1)", () => {
  const intersection = translatedAABBIntersection(
    [0, 0, 1],
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
  );
  expect(intersection.hit).toBe(true);
});
