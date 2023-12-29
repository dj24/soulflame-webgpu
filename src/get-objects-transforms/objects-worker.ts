import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "../voxel-object";
import { Camera } from "../camera";

const ctx: Worker = self as any;

type GetObjectsArgs = {
  maxObjectCount: number;
  objectCount: number;
  scale: number;
  translateX: number;
  rotateY: number;
  camera: Camera;
  objectSize: Vec3;
};

const vikingSize = [18, 15, 8];
const cornellSize = [7, 7, 7];

const getOuterBox = (rotateY: number) => {
  let m = mat4.identity();
  let x = 0;
  let z = 0;
  let y = 0;
  mat4.translate(m, [x, y, z], m);
  mat4.translate(m, vec3.divScalar(cornellSize, 2), m);
  mat4.scale(m, [1, 1, 1], m);
  mat4.rotateY(m, rotateY, m);
  mat4.translate(m, vec3.divScalar(cornellSize, -2), m);
  return new VoxelObject(m, cornellSize, [0, 0, 0]);
};

const getInnerBox = (rotateY: number) => {
  let m = mat4.identity();
  let x = -5;
  let z = 0;
  let y = -5;
  mat4.translate(m, [x, y, z], m);
  mat4.translate(m, vec3.divScalar(vikingSize, 2), m);
  mat4.scale(m, [0.2, 0.2, 0.2], m);
  mat4.rotateY(m, rotateY, m);
  mat4.translate(m, vec3.divScalar(vikingSize, -2), m);
  return new VoxelObject(m, vikingSize, [cornellSize[0], 0, 0]);
};

// TODO: allow dynamic objects to be passed, probably via object atlas
const getObjectTransforms = ({
  maxObjectCount,
  objectCount,
  scale,
  translateX,
  rotateY,
  camera,
  objectSize,
}: GetObjectsArgs) => {
  // const spaceBetweenObjects = 16;
  // const gapX = objectSize[0] + spaceBetweenObjects;
  // const gapZ = objectSize[2] + spaceBetweenObjects;
  // const rows = 12;
  // let voxelObjects = [...Array(maxObjectCount).keys()].map((index) => {
  //   let m = mat4.identity();
  //   let x = (index % rows) * gapX;
  //   let z = Math.floor(index / rows) * gapZ;
  //   let y = Math.sin(x + z) * 20;
  //   mat4.translate(m, [translateX + x, y, z], m);
  //   mat4.translate(m, vec3.divScalar(objectSize, 2), m);
  //   mat4.rotateY(m, rotateY, m);
  //   mat4.scale(m, [scale, scale, scale], m);
  //   mat4.translate(m, vec3.divScalar(objectSize, -2), m);
  //   return new VoxelObject(m, objectSize);
  // });

  let voxelObjects = [getInnerBox(rotateY), getOuterBox(rotateY)];
  // sort by distance to the camera
  // voxelObjects = voxelObjects.sort((a, b) => {
  //   const aDistance = vec3.distance(a.worldSpaceCenter, camera.position);
  //   const bDistance = vec3.distance(b.worldSpaceCenter, camera.position);
  //   return aDistance - bDistance;
  // });
  let activeVoxelObjects = voxelObjects;
  //
  // activeVoxelObjects = activeVoxelObjects.filter(
  //   (voxelObject, index) => index <= objectCount,
  // );
  activeVoxelObjects = activeVoxelObjects.slice(0, objectCount);

  // TODO: figure out what this does
  const bufferPadding = [
    ...Array(maxObjectCount - activeVoxelObjects.length).keys(),
  ].map(() => new VoxelObject(mat4.identity(), [0, 0, 0], [0, 0, 0]));
  voxelObjects = [...activeVoxelObjects, ...bufferPadding];

  return voxelObjects;
};

ctx.onmessage = (event: MessageEvent<GetObjectsArgs>) => {
  const result = getObjectTransforms(event.data).flatMap((voxelObject) =>
    voxelObject.toArray(),
  );
  ctx.postMessage(result);
};
