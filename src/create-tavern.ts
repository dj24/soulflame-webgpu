import { VolumeAtlas } from "./volume-atlas";
import tavernDefinition from "./voxel-models/Tavern/Tavern.json";
import { create3dTexture } from "./create-3d-texture/create-3d-texture";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { mat4 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import { GetObjectsArgs } from "./get-objects-transforms/objects-worker";

let objects: VoxelObject[] = [];

export const createTavern = async (
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
) => {
  const childObjects = tavernDefinition.children;
  const uniqueChildNames = new Set(childObjects.map((child) => child.name));
  const uniqueChildNamesArray = Array.from(uniqueChildNames);

  for (const name of uniqueChildNamesArray) {
    const voxels = await import(`./voxel-models/Tavern/${name}.vxm`);
    let texture = await create3dTexture(
      device,
      voxels.sliceFilePaths,
      voxels.size,
      name,
    );
    texture = await removeInternalVoxels(device, texture);
    generateOctreeMips(device, texture);
    volumeAtlas.addVolume(texture, name);
    texture.destroy();
  }

  const volumes = volumeAtlas.getVolumes();
  childObjects.forEach((child, index) => {
    const volume = volumes[child.name];
    if (!volume) {
      console.warn(`Volume not found for child ${child.name}, skipping...`);
      return;
    }
    if (child.name !== "Table") {
      return;
    }
    const m = mat4.identity();
    const rotationM = mat4.fromQuat(child.rotation);
    mat4.scale(m, child.scale, m);
    mat4.multiply(m, rotationM, m);
    mat4.translate(m, child.position, m);
    console.log({ child });

    objects.push(new VoxelObject(m, volume.size, volume.location));
  });
  console.log("Tavern created", objects);
};

const paddingElement = new VoxelObject(mat4.identity(), [0, 0, 0], [0, 0, 0]);

export const getObjectTransforms = ({ maxObjectCount }: GetObjectsArgs) => {
  let voxelObjects = objects;
  let activeVoxelObjects = voxelObjects;
  let objectCount = Math.min(maxObjectCount, voxelObjects.length);
  activeVoxelObjects = activeVoxelObjects.slice(0, objectCount);

  const differenceInObjectCount = maxObjectCount - objectCount;
  const padding = new Array(differenceInObjectCount).fill(paddingElement);
  voxelObjects = [...activeVoxelObjects, ...padding];
  return voxelObjects;
};
