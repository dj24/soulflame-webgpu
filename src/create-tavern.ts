import { VolumeAtlas } from "./volume-atlas";
import { create3dTexture } from "./create-3d-texture/create-3d-texture";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { mat4 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { convertVxm } from "./convert-vxm";
import { createTextureFromVoxels } from "./create-texture-from-voxels/create-texture-from-voxels";

export let voxelObjects: VoxelObject[] = [];

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
  "Dragon",
  "Table",
  "Bench",
  "Stool",
  "BarTop",
  "BarTopS",
  "BarTop1",
  "Barrel",
  "Keg",
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
];

type ProcessTavernObject = { name: string; texture: GPUTexture };

// TODO: use same command encoder for all commands
// TODO: try and encode all objects into one command buffer
const processTavernObject = async (
  name: string,
  device: GPUDevice,
): Promise<ProcessTavernObject> => {
  console.time(`Fetch ${name}`);
  const response = await fetch(`./Tavern/${name}.vxm`);
  console.timeEnd(`Fetch ${name}`);

  const arrayBuffer = await response.arrayBuffer();

  console.time(`Convert ${name}`);
  const voxels = convertVxm(arrayBuffer);
  console.timeEnd(`Convert ${name}`);

  console.time(`Create texture from voxels for ${name}`);
  const createTextureResult = createTextureFromVoxels(device, voxels);
  let texture = createTextureResult.texture;
  console.timeEnd(`Create texture from voxels for ${name}`);

  console.time(`Remove internal voxels from ${name}`);
  const removeInternalVoxelsResult = removeInternalVoxels(device, texture);
  texture = removeInternalVoxelsResult.texture;
  console.timeEnd(`Remove internal voxels from ${name}`);

  console.time(`Generate octree mips for ${name}`);
  const generateOctreesResult = generateOctreeMips(device, texture);
  console.timeEnd(`Generate octree mips for ${name}`);

  console.time(`Command buffers ${name}`);
  const commandBuffers = [
    removeInternalVoxelsResult.commandBuffer,
    createTextureResult.commandBuffer,
    ...generateOctreesResult.commandBuffers,
  ];
  device.queue.submit(commandBuffers);
  await device.queue.onSubmittedWorkDone();
  console.timeEnd(`Command buffers ${name}`);

  return { name, texture };
};

export const createTavern = async (
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
) => {
  const tavernResponse = await fetch("./Tavern.json");
  const tavernDefinition = (await tavernResponse.json()) as TSceneDefinition;
  const childObjects = tavernDefinition.children.filter((child) =>
    NAME_ALLOWLIST.includes(child.name),
  );
  const uniqueChildNames = new Set(childObjects.map((child) => child.name));
  const uniqueChildNamesArray = Array.from(uniqueChildNames);

  console.time("Load all volumes");

  let textures: ProcessTavernObject[] = [];

  console.time("Process all volumes");
  // for (const name of uniqueChildNamesArray) {
  //   const texture = await processTavernObject(name, device);
  //   textures.push(texture);
  // }

  textures = await Promise.all(
    uniqueChildNamesArray.map((name) => processTavernObject(name, device)),
  );

  console.timeEnd("Process all volumes");

  // TODO: promise all or web worker here
  console.time("Add all volumes to atlas");
  for (const { name, texture } of textures) {
    console.time(`Add volume for ${name}`);
    await volumeAtlas.addVolume(texture, name);
    console.timeEnd(`Add volume for ${name}`);
    texture.destroy();
    console.timeEnd(`Loaded ${name}`);
  }
  console.timeEnd("Add all volumes to atlas");
  console.timeEnd("Load all volumes");

  const volumes = volumeAtlas.getVolumes();

  for (const child of childObjects) {
    const volume = volumes[child.name];
    console.log({ volumes, volume, child });
    if (!volume) {
      console.warn(`Volume not found for child ${child.name}, skipping...`);
      return;
    }
    const m = mat4.identity();
    mat4.translate(m, child.position, m);
    mat4.scale(m, child.scale, m);
    mat4.multiply(m, mat4.fromQuat(child.rotation), m);
    voxelObjects.push(
      new VoxelObject(m, volume.size, volume.location, child.name),
    );
  }
  console.debug(`Tavern created with ${voxelObjects.length} items`);
};
