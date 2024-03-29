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
  "Bed",
  "Torch",
  "TorchHolder",
  "FireLogs",
  // "Tankard",
  "Bookshelf",
  "Books4",
  "Door",
  // "BigDoor",
  "Tavern",
];

type ProcessTavernObject = { name: string; texture: GPUTexture };

const processTavernObject = async (
  commandEncoder: GPUCommandEncoder,
  name: string,
  device: GPUDevice,
): Promise<ProcessTavernObject> => {
  console.time(`Fetch ${name}`);
  const response = await fetch(`./Tavern/${name}.vxm`);
  console.timeEnd(`Fetch ${name}`);

  const arrayBuffer = await response.arrayBuffer();

  const voxels = convertVxm(arrayBuffer);

  console.time(`Create texture from voxels for ${name}`);
  let texture = createTextureFromVoxels(commandEncoder, device, voxels);
  console.timeEnd(`Create texture from voxels for ${name}`);

  // console.time(`Remove internal voxels from ${name}`);
  // texture = removeInternalVoxels(commandEncoder, device, texture);
  // console.timeEnd(`Remove internal voxels from ${name}`);

  // console.time(`Generate octree mips for ${name}`);
  // generateOctreeMips(commandEncoder, device, texture);
  // console.timeEnd(`Generate octree mips for ${name}`);

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

  let commandEncoder = device.createCommandEncoder();

  console.time("Load all volumes");
  {
    let textures = await Promise.all(
      uniqueChildNamesArray.map((name) =>
        processTavernObject(commandEncoder, name, device),
      ),
    );
    for (const { name, texture } of textures) {
      console.time(`Add volume for ${name}`);
      volumeAtlas.addVolume(commandEncoder, texture, name);
      device.queue.submit([commandEncoder.finish()]);
      commandEncoder = device.createCommandEncoder();
      console.timeEnd(`Add volume for ${name}`);
    }
  }

  console.timeEnd("Load all volumes");

  const volumes = volumeAtlas.getVolumes();

  let torchPositions = [];

  for (const child of childObjects) {
    const volume = volumes[child.name];
    if (!volume) {
      console.warn(`Volume not found for child ${child.name}, skipping...`);
      return;
    }
    const m = mat4.identity();
    if (child.name === "Candle") {
      torchPositions.push(child.position);
    }
    mat4.translate(m, child.position, m);
    mat4.scale(m, child.scale, m);
    mat4.multiply(m, mat4.fromQuat(child.rotation), m);
    voxelObjects.push(
      new VoxelObject(m, volume.size, volume.location, child.name),
    );
  }
  console.log({ volumes, torchPositions });
  console.debug(`Tavern created with ${voxelObjects.length} items`);
};
