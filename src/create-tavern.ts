import { VolumeAtlas } from "./volume-atlas";
import tavernDefinition from "./voxel-models/Tavern/Tavern.json";
import { create3dTexture } from "./create-3d-texture/create-3d-texture";
import treeHouse from "./voxel-models/tavern.vxm";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { device } from "./app";

export const createTavern = async (
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
) => {
  const childObjects = tavernDefinition.children;
  const uniqueChildNames = new Set(childObjects.map((child) => child.name));
  const uniqueChildNamesArray = Array.from(uniqueChildNames);
  const importedVoxels = await Promise.all(
    uniqueChildNamesArray.map(async (name) => {
      const voxels = await import(`./voxel-models/Tavern/${name}.vxm`);
      let texture = await create3dTexture(
        device,
        voxels.sliceFilePaths,
        treeHouse.size,
        name,
      );
      texture = await removeInternalVoxels(device, texture);
      generateOctreeMips(device, texture);
      volumeAtlas.addVolume(texture, name);
      texture.destroy();
    }),
  );
};
