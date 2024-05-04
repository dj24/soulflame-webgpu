import { VolumeAtlas } from "./volume-atlas";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { mat4 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { convertVxm } from "./convert-vxm";
import { createTextureFromVoxels } from "./create-texture-from-voxels/create-texture-from-voxels";
import { createPaletteTextureFromVoxels } from "./create-texture-from-voxels/create-palette-texture-from-voxels";
import { writeTextureToCanvas } from "./write-texture-to-canvas";

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
  "street-scene",
  // "debug-plane",
  "Dragon",
  "monu10",
  "teapot",
  // "sponza-small",
  "Sponza",
  // "Table",
  // "Bench",
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
  // "Tavern",
];

const processTavernObject = async (
  commandEncoder: GPUCommandEncoder,
  name: string,
  device: GPUDevice,
) => {
  console.time(`Fetch ${name}`);
  const response = await fetch(`./Tavern/${name}.vxm`);
  console.timeEnd(`Fetch ${name}`);

  const arrayBuffer = await response.arrayBuffer();

  const voxels = convertVxm(arrayBuffer);

  console.time(`Create texture from voxels for ${name}`);
  let texture = await createTextureFromVoxels(device, voxels);
  console.timeEnd(`Create texture from voxels for ${name}`);

  console.time(`Create palette texture for ${name}`);
  const palette = await createPaletteTextureFromVoxels(device, voxels);
  console.timeEnd(`Create palette texture for ${name}`);

  return { name, texture, palette };
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
    for (const { name, texture, palette } of textures) {
      console.time(`Add volume for ${name}`);
      await volumeAtlas.addVolume(texture, palette, name);
      commandEncoder = device.createCommandEncoder();
      console.timeEnd(`Add volume for ${name}`);
    }
  }

  console.timeEnd("Load all volumes");

  const volumes = volumeAtlas.dictionary;

  let torchPositions = [];

  for (const child of childObjects) {
    const volume = volumes[child.name];
    if (!volume) {
      console.warn(`Volume not found for child ${child.name}, skipping...`);
      return;
    }
    if (child.name === "Candle") {
      torchPositions.push(child.position);
    }

    const { position, rotation, scale, name } = child;
    const { size, location, paletteIndex } = volume;

    voxelObjects.push(
      new VoxelObject({
        position,
        rotation,
        scale,
        size,
        atlasLocation: location,
        name,
        paletteIndex,
      }),
    );
  }
  console.log({ volumes });
  console.debug(`Tavern created with ${voxelObjects.length} items`);
};
