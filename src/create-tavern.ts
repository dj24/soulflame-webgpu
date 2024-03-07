import { VolumeAtlas } from "./volume-atlas";
import { create3dTexture } from "./create-3d-texture/create-3d-texture";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { GetObjectsArgs } from "./get-objects-transforms/objects-worker";
import { camera } from "./app";

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
  "Candle",
  "Bed",
  "Torch",
  "TorchHolder",
  "FireLogs",
  "Tankard",
  "Bookshelf",
  "Books4",
];

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

  console.log({ uniqueChildNamesArray });

  for (const name of uniqueChildNamesArray) {
    const voxels = await import(`./voxel-models/Tavern/${name}.vxm`);
    if (name === "Dragon") {
      console.log({ [name]: voxels });
    }
    let texture = await create3dTexture(
      device,
      voxels.sliceFilePaths,
      voxels.size,
      name,
    );
    texture = await removeInternalVoxels(device, texture);
    generateOctreeMips(device, texture);
    await volumeAtlas.addVolume(texture, name);
    texture.destroy();
  }

  const volumes = volumeAtlas.getVolumes();

  childObjects.forEach((child, index) => {
    const volume = volumes[child.name];
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
  });
  console.debug(`Tavern created with ${voxelObjects.length} items`);
};

const paddingElement = new VoxelObject(mat4.identity(), [0, 0, 0], [0, 0, 0]);

/**
 * Returns the object transforms with padding to fill the maxObjectCount
 * This is temporary until the matrices buffer is dynamically sized
 * @param maxObjectCount
 */
export const getObjectTransformsWithPadding = ({
  maxObjectCount,
}: GetObjectsArgs) => {
  console.log({ maxObjectCount });
  console.log({ objectCount: voxelObjects.length });
  let objectCount = Math.min(maxObjectCount, voxelObjects.length);
  let activeVoxelObjects = voxelObjects.slice(0, objectCount);
  // activeVoxelObjects = sortObjectsByDistanceToCamera(
  //   activeVoxelObjects,
  //   camera.position,
  // );

  const differenceInObjectCount = maxObjectCount - objectCount;
  const padding = new Array(differenceInObjectCount).fill(paddingElement);
  voxelObjects = [...activeVoxelObjects, ...padding];
  return voxelObjects;
};
