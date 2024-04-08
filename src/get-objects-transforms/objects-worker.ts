import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "../voxel-object";
import { Camera } from "../camera";
import { debugValues } from "../app";

const ctx: Worker = self as any;

export type GetObjectsArgs = {
  maxObjectCount: number;
  objectCount: number;
  scale: number;
  translateX: number;
  rotateY: number;
};

const teapotSize = [126, 61, 79];
const cornellSize = [7, 7, 7];

const getOuterBox = (rotateY: number) => {
  let m = mat4.identity();
  let x = 0;
  let z = 0;
  let y = 0;
  mat4.translate(m, [x, y, z], m);
  mat4.translate(m, vec3.divScalar(cornellSize, 2), m);
  let scale = 1.5;
  mat4.scale(m, [scale, scale, scale], m);
  mat4.rotateY(m, rotateY, m);
  mat4.translate(m, vec3.divScalar(cornellSize, -2), m);
  return new VoxelObject(m, cornellSize, [0, 0, 0], 0);
};

const getInnerBox = (x: number, z: number = 0) => {
  // let m = mat4.identity();
  // let scaleFactor = 0.1;
  // mat4.translate(m, [x, 0, z], m);
  // mat4.scale(m, [scaleFactor, scaleFactor, scaleFactor], m);
  // mat4.rotateY(m, Math.PI, m);
  // mat4.translate(m, vec3.divScalar(treeHouseVolume.size, 2), m);
  // mat4.translate(m, vec3.divScalar(treeHouseVolume.size, -2), m);
  // return new VoxelObject(m, treeHouseVolume.size, [0, 0, 0]);
};

const getDragon = (x: number, z: number = 0) => {
  // let m = mat4.identity();
  // let scaleFactor = 0.1;
  // let atlasLocation = [64, 0, 0];
  // mat4.translate(m, [x, 0, z], m);
  // mat4.scale(m, [scaleFactor, scaleFactor, scaleFactor], m);
  // mat4.rotateY(m, Math.PI, m);
  // mat4.translate(m, vec3.divScalar(dragonVolume.size, 2), m);
  // mat4.translate(m, vec3.divScalar(dragonVolume.size, -2), m);
  // return new VoxelObject(m, dragonVolume.size, atlasLocation);
};

const updateInnerBox = (
  voxelObject: VoxelObject,
  rotateY: number,
  x = 0,
  scale = 1,
) => {
  voxelObject.previousTransform = mat4.clone(voxelObject.transform);
  voxelObject.previousInverseTransform = mat4.clone(
    voxelObject.inverseTransform,
  );
  let m = mat4.identity();
  let z = 0;
  let y = 0;
  mat4.translate(m, [x, y, z], m);
  let scaleFactor = scale * 0.1;
  mat4.scale(m, [scaleFactor, scaleFactor, scaleFactor], m);
  mat4.translate(m, vec3.divScalar(voxelObject.size, 2), m);
  mat4.rotateY(m, rotateY - 1, m);
  mat4.translate(m, vec3.divScalar(voxelObject.size, -2), m);
  voxelObject.transform = m;
  voxelObject.inverseTransform = mat4.invert(m);
};

const teaPots = [1, 2, 3, 4, 5, 6, 7].map((i) =>
  getInnerBox((i % 3) * 8 + 8, (i / 2) * 8),
);

const foo = getDragon(0, 0);

const paddingElement = new VoxelObject(
  mat4.identity(),
  [0, 0, 0],
  [0, 0, 0],
  0,
);

// TODO: allow dynamic objects to be passed, probably via object atlas
const getObjectTransforms = ({
  maxObjectCount,
  objectCount,
  scale,
  translateX,
  rotateY,
}: GetObjectsArgs) => {
  // updateInnerBox(foo, rotateY, translateX, scale * 0.5);
  // // updateInnerBox(teaPot2, rotateY, translateX, scale);
  // let voxelObjects = [foo, ...teaPots];
  // let activeVoxelObjects = voxelObjects;
  // activeVoxelObjects = activeVoxelObjects.slice(0, voxelObjects.length);
  // const differenceInObjectCount = maxObjectCount - voxelObjects.length;
  // const padding = new Array(differenceInObjectCount).fill(paddingElement);
  // voxelObjects = [...activeVoxelObjects, ...padding];
  // return voxelObjects;
};

ctx.onmessage = (event: MessageEvent<GetObjectsArgs>) => {
  // const result = getObjectTransforms(event.data).flatMap((voxelObject) =>
  //   voxelObject.toArray(),
  // );
  // ctx.postMessage(result);
};
