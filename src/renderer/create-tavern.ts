import { VolumeAtlas } from "./volume-atlas";
import { quat } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { convertVxm } from "./convert-vxm";
import { ECS } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { convert3DTo1D } from "../procgen/noise-cache";
import { createOctreeAndReturnBytes } from "../procgen/sine-chunk";
import { Octree, OCTREE_STRIDE } from "@renderer/octree/octree";
import { getMaxSizeOfOctree } from "../procgen/create-terrain-chunk";

type TSceneDefinition = {
  name: string;
  position: number[];
  rotation: number[];
  scale: number[];
  children: {
    name: string;
    position: number[];
    rotation: number[];
    scale: number[];
  }[];
};

const NAME_ALLOWLIST = [
  // "street-scene",
  // "debug-plane",
  // "Dragon",
  "teapot",
  // "debug",
  // "monu10",
  // "sponza-small",
  // "Sponza",
  // "Table",
  // "Bench",
  // "Stool",
  // "BarTop",
  // "BarTopS",
  // "BarTop1",
  "Barrel",
  // "Keg",
  // "Candle",
  // "Bed",
  // "Torch",
  // "TorchHolder",
  // "FireLogs",
  // "Tankard",
  // "Bookshelf",
  // "Books4",
  // "Door",
  // "BigDoor",
  // "Tavern",
];

export const processNewVoxelImport = async (
  path: string,
  device: GPUDevice,
) => {
  const response = await fetch(path);
  const arrayBuffer = await response.arrayBuffer();
  const voxels = convertVxm(arrayBuffer);
  console.time(`Create octree for ${path}`);
  const cache = new Uint8Array(
    voxels.SIZE[0] * voxels.SIZE[1] * voxels.SIZE[2] * 3,
  );
  console.log({ voxels });
  voxels.XYZI.forEach((voxel) => {
    const index = convert3DTo1D(voxels.SIZE, [voxel.x, voxel.y, voxel.z]);
    cache[index * 3] = voxels.RGBA[voxel.c].r;
    cache[index * 3 + 1] = voxels.RGBA[voxel.c].g;
    cache[index * 3 + 2] = voxels.RGBA[voxel.c].b;
  });
  const getVoxel = (x: number, y: number, z: number) => {
    const index = convert3DTo1D(voxels.SIZE, [x, y, z]);
    const red = cache[index * 3];
    const green = cache[index * 3 + 1];
    const blue = cache[index * 3 + 2];
    if (red === 0 && green === 0 && blue === 0) {
      return null;
    }
    if (x >= voxels.SIZE[0] || y >= voxels.SIZE[1] || z >= voxels.SIZE[2]) {
      return null;
    }
    return {
      red: cache[index * 3],
      green: cache[index * 3 + 1],
      blue: cache[index * 3 + 2],
      solid: true,
    };
  };
  const uncompressedSize = getMaxSizeOfOctree(voxels.SIZE) * OCTREE_STRIDE;
  let uncompressedArrayBuffer = new SharedArrayBuffer(uncompressedSize);
  const octree = new Octree(
    getVoxel,
    () => 1,
    Math.max(voxels.SIZE[0], voxels.SIZE[1], voxels.SIZE[2]),
    uncompressedArrayBuffer,
  );

  // Resize the buffer to the correct size
  const oldArray = new Uint8Array(uncompressedArrayBuffer);
  const resizedArray = new Uint8Array(octree.totalSizeBytes);
  resizedArray.set(oldArray.subarray(0, octree.totalSizeBytes));

  console.timeEnd(`Create octree for ${path}`);

  const gpuBuffer = device.createBuffer({
    size: octree.totalSizeBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  device.queue.writeBuffer(gpuBuffer, 0, resizedArray);
  await device.queue.onSubmittedWorkDone();

  return new VoxelObject({
    name: path,
    size: [voxels.SIZE[0] * 2, voxels.SIZE[1] * 2, voxels.SIZE[2] * 2],
    octreeBufferIndex: 0,
    gpuBuffer,
    octreeBuffer: resizedArray.buffer,
  });
};

// export const createVoxelObject = async (
//   device: GPUDevice,
//   volumeAtlas: VolumeAtlas,
//   name: string,
//   path: string,
// ) => {
//   // If the volume isn't in the atlas, add it
//   if (!volumeAtlas.dictionary[path]) {
//     await processNewVoxelImport(path, device, volumeAtlas);
//   }
//
//   const { size, octreeOffset } = volumeAtlas.dictionary[path];
//
//   return new VoxelObject({
//     name,
//     size,
//     octreeBufferIndex: octreeOffset,
//   });
// };
//
// export const createTavern = async (
//   device: GPUDevice,
//   volumeAtlas: VolumeAtlas,
//   ecs: ECS,
// ) => {
//   const tavernResponse = await fetch("./Tavern.json");
//   const tavernDefinition = (await tavernResponse.json()) as TSceneDefinition;
//   const childObjects = tavernDefinition.children.filter((child) =>
//     NAME_ALLOWLIST.includes(child.name),
//   );
//   for (const child of childObjects) {
//     const voxelObject = await createVoxelObject(
//       device,
//       volumeAtlas,
//       child.name,
//       `./Tavern/${child.name}.vxm`,
//     );
//
//     const entity = ecs.addEntity();
//     ecs.addComponents(
//       entity,
//       new Transform(child.position, quat.identity(), child.scale),
//       voxelObject,
//       new KeyboardControllable(),
//     );
//   }
// };
