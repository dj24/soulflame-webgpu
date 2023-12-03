import { Matrix4x4 } from "./matrix4x4";
import { Vector3 } from "./vector3";

test("setting a value is correct", () => {
  const m = new Matrix4x4();
  m.set(0, 0, 1);
  expect(m.elements).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  m.set(1, 0, 1);
  expect(m.elements).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  m.set(2, 0, 1);
  expect(m.elements).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  m.set(0, 1, 1);
  expect(m.elements).toEqual([1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
});

test("translation is correct", () => {
  const m = Matrix4x4.identity;
  m.translate(new Vector3(1, 2, 3));
  expect(m.elements).toEqual([1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]);
});
