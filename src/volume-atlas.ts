import { vec3, Vec3 } from "wgpu-matrix";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { createBrickMapFromTexture } from "./create-brickmap/create-brick-map-from-texture";

const descriptorPartial: Omit<GPUTextureDescriptor, "size"> = {
  format: "rgba8unorm",
  usage:
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.STORAGE_BINDING,
  dimension: "3d",
};

type VolumeAtlasEntry = {
  location: Vec3;
  size: Vec3;
};

export type VolumeAtlasDictionary = {
  [key: string]: VolumeAtlasEntry;
};

export type VolumeAtlas = {
  getVolumes: () => VolumeAtlasDictionary;
  getVolume: (label: string) => VolumeAtlasEntry;
  addVolume: (
    commandEncoder: GPUCommandEncoder,
    texture: GPUTexture,
    brickMap: GPUBuffer,
    label: string,
  ) => void;
  removeVolume: (label: string) => void;
  getAtlasTextureView: () => GPUTextureView;
};

const copyTextureWithMips = (
  commandEncoder: GPUCommandEncoder,
  copySrc: GPUTexture,
  copyDst: GPUTexture,
) => {
  const { width, height, depthOrArrayLayers } = copySrc;
  for (let mipLevel = 0; mipLevel < copySrc.mipLevelCount; mipLevel++) {
    const mipWidth = Math.max(1, width >> mipLevel);
    const mipHeight = Math.max(1, height >> mipLevel);
    const mipDepth = Math.max(1, depthOrArrayLayers >> mipLevel);
    commandEncoder.copyTextureToTexture(
      {
        texture: copySrc,
        mipLevel,
        origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
      },
      {
        texture: copyDst,
        mipLevel,
        origin: { x: 0, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
      },
      {
        width: mipWidth,
        height: mipHeight,
        depthOrArrayLayers: mipDepth,
      },
    );
  }
};

const BRICKMAP_SIZE = 8;
const DEFAULT_ATLAS_SIZE = 8;
const BRICK_STRIDE_BYTES = 64;
const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

/**
 * Factory function for creating and managing a volume atlas
 * The atlas is a 3d texture that contains multiple voxel models, packing them along the x-axis
 * TODO: allow for overflows into the y-axis, and perhaps z-axis
 * @param device - The GPU device
 * @returns { getAtlasTextureView, addVolume, removeVolume }
 */
export const getVolumeAtlas = async (
  device: GPUDevice,
): Promise<VolumeAtlas> => {
  let dictionary: VolumeAtlasDictionary = {};
  const commandEncoder = device.createCommandEncoder();
  let atlasTexture = device.createTexture({
    size: {
      width: DEFAULT_ATLAS_SIZE,
      height: DEFAULT_ATLAS_SIZE,
      depthOrArrayLayers: DEFAULT_ATLAS_SIZE,
    },
    ...descriptorPartial,
    label: `Volume atlas containing `,
    mipLevelCount: 1,
  });

  const brickMapWidth = DEFAULT_ATLAS_SIZE / BRICKMAP_SIZE;

  let brickMapBuffer = createBrickMapFromTexture(device, atlasTexture);

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const getVolume = (label: string) => {
    return dictionary[label];
  };

  /**
   * Add a volume to the atlas. Requires `commandEncoder.finish()` to be called to execute the copy
   * @param commandEncoder - command encoder to use for copying the texture
   * @param texture - 3d texture to copy into the atlas
   * @param brickMap - brick map buffer for the volume
   * @param label - label to use for the volume in the dictionary
   */
  const addVolume = (
    commandEncoder: GPUCommandEncoder,
    texture: GPUTexture,
    brickMap: GPUBuffer,
    label: string,
  ) => {
    if (dictionary[label]) {
      throw new Error(
        `Error adding volume to atlas: volume with label ${label} already exists`,
      );
    }
    const { width, height, depthOrArrayLayers } = texture;
    const roundedWidth = ceilToNearestMultipleOf(width, BRICKMAP_SIZE);
    const roundedHeight = ceilToNearestMultipleOf(height, BRICKMAP_SIZE);
    const roundedDepth = ceilToNearestMultipleOf(
      depthOrArrayLayers,
      BRICKMAP_SIZE,
    );
    console.debug(`Adding ${label} to atlas`, {
      width,
      height,
      depthOrArrayLayers,
    });

    const newWidth = atlasTexture.width + roundedWidth;
    if (newWidth > device.limits.maxTextureDimension3D) {
      throw new Error(
        `Error adding volume to atlas: adding volume would exceed device max texture dimension of ${device.limits.maxTextureDimension3D}`,
      );
    }

    const newHeight = Math.max(atlasTexture.height, roundedHeight);
    const newDepth = Math.max(atlasTexture.depthOrArrayLayers, roundedDepth);

    const newMipLevelCount = Math.max(
      texture.mipLevelCount,
      atlasTexture.mipLevelCount,
    );
    console.debug(
      `Expanding atlas texture to [${newWidth}, ${newHeight}, ${newDepth}], mip levels: ${newMipLevelCount}`,
    );

    const newAtlasTexture = device.createTexture({
      size: {
        width: newWidth,
        height: newHeight,
        depthOrArrayLayers: newDepth,
      },
      mipLevelCount: newMipLevelCount,
      ...descriptorPartial,
      label: `${atlasTexture.label}, ${texture.label || "unnamed volume"}`,
    });
    const atlasLocationX = atlasTexture.width;
    // Copy the old atlas texture into the new larger one
    commandEncoder.copyTextureToTexture(
      {
        texture: atlasTexture,
      },
      {
        texture: newAtlasTexture,
      },
      {
        width: atlasTexture.width,
        height: atlasTexture.height,
        depthOrArrayLayers: atlasTexture.depthOrArrayLayers,
      },
    );
    commandEncoder.copyTextureToTexture(
      {
        texture,
      },
      {
        texture: newAtlasTexture,
        origin: { x: atlasLocationX, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
      },
      {
        width,
        height,
        depthOrArrayLayers,
      },
    );
    atlasTexture = newAtlasTexture;
    dictionary[label] = {
      location: [atlasLocationX, 0, 0],
      size: [width, height, depthOrArrayLayers],
    };
    createBrickMapFromTexture(device, atlasTexture);
  };

  /**
   * Remove a volume from the atlas
   * TODO: shift the atlas texture to fill the gap
   * TODO: check if out of bounds to allow for 8,8,1 num threads
   * @param label - label of the volume to remove
   */
  const removeVolume = async (label: string) => {
    if (!dictionary[label]) {
      throw new Error(
        `Error removing volume from atlas: volume with label ${label} does not exist`,
      );
    }
    if (!atlasTexture) {
      throw new Error(
        "Error removing from atlas: No atlas texture to remove volume from",
      );
    }
    const { location: startIndex, size } = dictionary[label];
    const endIndex = vec3.add(startIndex, size);
    const sizeOfRemoval = vec3.subtract(endIndex, startIndex);
    if (
      sizeOfRemoval[0] > atlasTexture.width ||
      sizeOfRemoval[1] > atlasTexture.height ||
      sizeOfRemoval[2] > atlasTexture.depthOrArrayLayers
    ) {
      throw new Error(
        `Error removing from atlas: volume to remove (${sizeOfRemoval}) is larger than atlas texture (${atlasTexture.width}, ${atlasTexture.height}, ${atlasTexture.depthOrArrayLayers})`,
      );
    }
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    const clearVolumePipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          code: `
                @group(0) @binding(0) var texture : texture_storage_3d<rgba8unorm, write>;
                override startX: u32 = 0;
                override startY: u32 = 0;
                override startZ: u32 = 0;
                @compute @workgroup_size(1, 1, 1)
                fn main(
                  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
                ) {
                  textureStore(texture, GlobalInvocationID + vec3(startX, startY, startZ), vec4(0.0));
                }
            `,
        }),
        entryPoint: "main",
        constants: {
          startX: startIndex[0],
          startY: startIndex[1],
          startZ: startIndex[2],
        },
      },
    });
    computePass.setPipeline(clearVolumePipeline);
    computePass.setBindGroup(
      0,
      device.createBindGroup({
        layout: clearVolumePipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: atlasTexture.createView(),
          },
        ],
      }),
    );
    computePass.dispatchWorkgroups(
      sizeOfRemoval[0],
      sizeOfRemoval[1],
      sizeOfRemoval[2],
    );
    computePass.end();

    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  };

  /**
   * @returns {GPUTextureView} - view of the atlas texture
   */
  const getAtlasTextureView = (): GPUTextureView => {
    if (!atlasTexture) {
      return null;
    }
    const view = atlasTexture.createView();
    view.label = atlasTexture.label;
    return view;
  };

  const getVolumes = (): VolumeAtlasDictionary => {
    return dictionary;
  };

  return {
    getVolumes,
    addVolume,
    getVolume,
    removeVolume,
    getAtlasTextureView,
  };
};
