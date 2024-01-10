import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "../voxel-object";
import { Camera } from "../camera";
import dragonVolume from "../voxel-models/dragon.vxm";
import { debugValues } from "../app";

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
  return new VoxelObject(m, cornellSize, [0, 0, 0]);
};

const getInnerBox = () => {
  let m = mat4.identity();
  let scaleFactor = 0.05;
  mat4.scale(m, [scaleFactor, scaleFactor, scaleFactor], m);
  mat4.translate(m, vec3.divScalar(dragonVolume.size, 2), m);
  mat4.translate(m, vec3.divScalar(dragonVolume.size, -2), m);
  return new VoxelObject(m, dragonVolume.size, [cornellSize[0], 0, 0]);
};

const updateInnerBox = (
  voxelObject: VoxelObject,
  rotateY: number,
  x = 0,
  scale = 1,
) => {
  voxelObject.previousTransform = mat4.clone(voxelObject.transform);
  let m = mat4.identity();
  let z = 0;
  let y = 0;
  mat4.translate(m, [x, y, z], m);
  let scaleFactor = scale * 0.05;
  mat4.scale(m, [scaleFactor, scaleFactor, scaleFactor], m);
  mat4.translate(m, vec3.divScalar(voxelObject.size, 2), m);
  mat4.rotateY(m, rotateY - 1, m);
  mat4.translate(m, vec3.divScalar(voxelObject.size, -2), m);
  voxelObject.transform = m;
  voxelObject.inverseTransform = mat4.invert(m);
};

const cornellBox = getOuterBox(0);
const teaPot = getInnerBox();

// TODO: allow dynamic objects to be passed, probably via object atlas
const getObjectTransforms = ({
  maxObjectCount,
  objectCount,
  scale,
  translateX,
  rotateY,
}: GetObjectsArgs) => {
  updateInnerBox(teaPot, rotateY, translateX, scale);

  let voxelObjects = [teaPot];

  let activeVoxelObjects = voxelObjects;

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
