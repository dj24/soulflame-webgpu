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

export const createTavern = async (
  device: GPUDevice,
  volumeAtlas: VolumeAtlas,
) => {
  const tavernResponse = await fetch("./Tavern.json");
  const tavernDefinition = (await tavernResponse.json()) as TSceneDefinition;

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
    // texture = await removeInternalVoxels(device, texture);
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
    if (
      ![
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
        "FireLogs",
        // "Tankard",
        // "Bookshelf",
        // "Books4",
      ].includes(child.name)
    ) {
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
  console.log(`Tavern created with ${voxelObjects.length} items`);
};

const paddingElement = new VoxelObject(mat4.identity(), [0, 0, 0], [0, 0, 0]);

const getClosestPointToCamera = (object: VoxelObject) => {
  return object.worldSpaceCorners.sort((a, b) => {
    const aDistance = vec3.distance(a, camera.position);
    const bDistance = vec3.distance(b, camera.position);
    return aDistance - bDistance;
  })[0];
};

const sortObjectsByDistanceToCamera = (
  voxelObjects: VoxelObject[],
  cameraPosition: Vec3,
) => {
  return voxelObjects.sort((a, b) => {
    const aDistance = vec3.distance(a.worldSpaceCenter, cameraPosition);
    const bDistance = vec3.distance(b.worldSpaceCenter, cameraPosition);
    return aDistance - bDistance;
  });
};

export const getObjectTransforms = ({ maxObjectCount }: GetObjectsArgs) => {
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
