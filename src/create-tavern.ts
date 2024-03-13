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
  // "Stool",
  // "BarTop",
  // "BarTopS",
  // "BarTop1",
  // "Barrel",
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
];

const processTavernObject = async (
  name: string,
  device: GPUDevice,
): Promise<GPUTexture> => {
  console.time(`Fetch ${name}`);
  const response = await fetch(`./Tavern/${name}.vxm`);
  console.timeEnd(`Fetch ${name}`);
  const arrayBuffer = await response.arrayBuffer();
  const voxels = convertVxm(arrayBuffer);
  console.time(`Create texture from voxels for ${name}`);
  let texture = await createTextureFromVoxels(device, voxels);
  console.timeEnd(`Create texture from voxels for ${name}`);
  console.time(`Remove internal voxels from ${name}`);
  texture = await removeInternalVoxels(device, texture);
  console.timeEnd(`Remove internal voxels from ${name}`);
  console.time(`Generate octree mips for ${name}`);
  await generateOctreeMips(device, texture);
  console.timeEnd(`Generate octree mips for ${name}`);
  return texture;
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

  // TODO: promise all or web worker here
  for (const name of uniqueChildNamesArray) {
    console.time(`Loaded ${name}`);
    const texture = await processTavernObject(name, device);
    console.time(`Add volume for ${name}`);
    await volumeAtlas.addVolume(texture, name);
    console.timeEnd(`Add volume for ${name}`);
    texture.destroy();
    console.timeEnd(`Loaded ${name}`);
  }
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
