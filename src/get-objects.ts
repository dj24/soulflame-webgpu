import tower from "./voxel-models/tower.vxm";
import building from "./voxel-models/building.vxm";
import viking from "./voxel-models/mini-viking.vxm";
import {mat4, vec3, Vec3} from "wgpu-matrix";
import {camera, maxObjectCount, objectCount, scale, translateX} from "./app";
import {VoxelObject} from "./voxel-object";
import {isInsideFrustum} from "./is-inside-frustum";

export const getObjects = () => {
  const objectSize = viking.size as Vec3;
  const spaceBetweenObjects = 16;
  const gapX = objectSize[0] + spaceBetweenObjects;
  const gapZ = objectSize[2] + spaceBetweenObjects;
  const rows = 16;
  let voxelObjects = [...Array(maxObjectCount).keys()].map((index) => {
    let m = mat4.identity();
    let x = (index % rows) * gapX;
    let y = (Math.sin(performance.now() * 0.001 + x * 0.02) * 0.5 + 0.5) * 20;
    y = 0;
    let z = Math.floor(index / rows) * gapZ;
    let height =
      Math.sin(performance.now() * 0.0005 + x * 0.008 + z * 0.016) * 0.5 +
      0.5;
    height = Math.max(height, 0.01);
    mat4.translate(m, [translateX + x, y, z], m);
    mat4.translate(m, vec3.divScalar(objectSize, 2), m);
    mat4.rotateY(m, performance.now() * 0.0005, m);
    // mat4.scale(m, [scale, height, scale], m);
    mat4.translate(m, vec3.divScalar(objectSize, -2), m);
    return new VoxelObject(m, objectSize);
  });
// sort by distance to the camera
  voxelObjects = voxelObjects.sort((a, b) => {
    const aDistance = vec3.distance(a.worldSpaceCenter, camera.position);
    const bDistance = vec3.distance(b.worldSpaceCenter, camera.position);
    return aDistance - bDistance;
  });

  let activeVoxelObjects = voxelObjects;

  activeVoxelObjects = activeVoxelObjects.filter(
    (voxelObject, index) =>
      index <= objectCount
  );

  // activeVoxelObjects = activeVoxelObjects.filter(
  //   (voxelObject, index) =>
  //     !isInsideFrustum({
  //       viewProjectionMatrix: camera.viewProjectionMatrix,
  //       voxelObject,
  //     }),
  // );

  activeVoxelObjects = activeVoxelObjects.slice(0, objectCount);

  const bufferPadding = [
    ...Array(maxObjectCount - activeVoxelObjects.length).keys(),
  ].map(() => new VoxelObject(mat4.identity(), [0, 0, 0]));
  voxelObjects = [...activeVoxelObjects, ...bufferPadding];

  return voxelObjects;

}