import { VolumeAtlas } from "./volume-atlas";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { mat4, quat } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { convertVxm } from "./convert-vxm";
import { createTextureFromVoxels } from "./create-texture-from-voxels/create-texture-from-voxels";
import { createPaletteTextureFromVoxels } from "./create-texture-from-voxels/create-palette-texture-from-voxels";
import { writeTextureToCanvas } from "./write-texture-to-canvas";
import { Octree, octreeToArrayBuffer } from "./octree/octree";
import { ECS } from "@ecs/ecs";
import { Transform } from "@renderer/components/transform";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { KeyboardControllable } from "@input/components/keyboard-controllable";

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

const processNewVoxelImport = async (
  path: string,
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
) => {
  console.time(`Fetch ${path}`);
  const response = await fetch(path);
  console.timeEnd(`Fetch ${path}`);

  const arrayBuffer = await response.arrayBuffer();
  const voxels = convertVxm(arrayBuffer);

  console.time(`Create texture from voxels for ${path}`);
  let texture = await createTextureFromVoxels(device, voxels);
  console.timeEnd(`Create texture from voxels for ${path}`);

  console.time(`Create octree for ${path}`);
  const octree = new Octree(voxels);
  const octreeArrayBuffer = octreeToArrayBuffer(octree);
  console.timeEnd(`Create octree for ${path}`);

  console.time(`Create palette texture for ${path}`);
  const palette = await createPaletteTextureFromVoxels(device, voxels);
  console.timeEnd(`Create palette texture for ${path}`);

  await volumeAtlas.addVolume(texture, palette, path, octreeArrayBuffer);
};

export const createVoxelObject = async (
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
  name: string,
  path: string,
) => {
  // If the volume isn't in the atlas, add it
  if (!volumeAtlas.dictionary[path]) {
    await processNewVoxelImport(path, device, volumeAtlas);
  }

  const { size, location, paletteIndex, octreeOffset } =
    volumeAtlas.dictionary[path];

  return new VoxelObject({
    name,
    size,
    atlasLocation: location,
    paletteIndex,
    octreeBufferIndex: octreeOffset,
  });
};

export const createTavern = async (
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
  ecs: ECS,
) => {
  const tavernResponse = await fetch("./Tavern.json");
  const tavernDefinition = (await tavernResponse.json()) as TSceneDefinition;
  const childObjects = tavernDefinition.children.filter((child) =>
    NAME_ALLOWLIST.includes(child.name),
  );
  for (const child of childObjects) {
    const voxelObject = await createVoxelObject(
      device,
      volumeAtlas,
      child.name,
      `./Tavern/${child.name}.vxm`,
    );

    const entity = ecs.addEntity();
    ecs.addComponents(
      entity,
      new Transform(child.position, quat.identity(), child.scale),
      voxelObject,
      new KeyboardControllable(),
    );
  }
};
