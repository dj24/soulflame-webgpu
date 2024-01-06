import { vec3, Vec3 } from "wgpu-matrix";

const descriptorPartial: Omit<GPUTextureDescriptor, "size"> = {
  format: "rgba8unorm",
  usage:
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.STORAGE_BINDING,
  dimension: "3d",
};

export type VolumeAtlas = {
  addVolume: (texture: GPUTexture, label: string) => void;
  removeVolume: (label: string) => void;
  getAtlasTextureView: () => GPUTextureView;
};

export type VolumeAtlasDictionary = {
  [key: string]: { location: Vec3; size: Vec3 };
};

/**
 * Factory function for creating and managing a volume atlas
 * The atlas is a 3d texture that contains multiple voxel models, packing them along the x-axis
 * TODO: allow for overflows into the y-axis, and perhaps z-axis
 * TODO: add surface cache for GI
 * @param device - The GPU device
 * @returns { getAtlasTextureView, addVolume, removeVolume }
 */
export const getVolumeAtlas = (device: GPUDevice): VolumeAtlas => {
  let atlasTexture: GPUTexture = null;
  let dictionary: VolumeAtlasDictionary = {};

  /**
   * Add a volume to the atlas
   * @param texture - 3d texture to copy into the atlas
   * @param label - label to use for the volume in the dictionary
   */
  const addVolume = (texture: GPUTexture, label: string) => {
    if (dictionary[label]) {
      throw new Error(
        `Error adding volume to atlas: volume with label ${label} already exists`,
      );
    }
    const { width, height, depthOrArrayLayers } = texture;
    if (!atlasTexture) {
      const commandEncoder = device.createCommandEncoder();
      atlasTexture = device.createTexture({
        size: { width, height, depthOrArrayLayers },
        ...descriptorPartial,
        label: `Volume atlas containing ${texture.label || "unnamed volume"}`,
      });
      commandEncoder.copyTextureToTexture(
        {
          texture,
          mipLevel: 0, // Assuming mip level 0 for simplicity
          origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
        },
        {
          texture: atlasTexture,
          mipLevel: 0, // Assuming mip level 0 for simplicity
          origin: { x: atlasTexture.width - width, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
        },
        {
          width,
          height,
          depthOrArrayLayers,
        },
      );
      device.queue.submit([commandEncoder.finish()]);
      return;
    }
    const newWidth = atlasTexture.width + width;
    if (newWidth > device.limits.maxTextureDimension3D) {
      throw new Error(
        `Error adding volume to atlas: adding volume would exceed device max texture dimension of ${device.limits.maxTextureDimension3D}`,
      );
    }
    const oldAtlasTexture = atlasTexture;
    const newAtlasTexture = device.createTexture({
      size: {
        width: newWidth,
        height: Math.max(atlasTexture.height, height),
        depthOrArrayLayers: Math.max(
          atlasTexture.depthOrArrayLayers,
          depthOrArrayLayers,
        ),
      },
      ...descriptorPartial,
      label: `${atlasTexture.label}, ${texture.label || "unnamed volume"}`,
    });
    const commandEncoder = device.createCommandEncoder();
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
        origin: { x: newAtlasTexture.width - width, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
      },
      {
        width,
        height,
        depthOrArrayLayers,
      },
    );
    device.queue.submit([commandEncoder.finish()]);
    atlasTexture = newAtlasTexture;
    oldAtlasTexture.destroy();
    dictionary[label] = {
      location: [newAtlasTexture.width - width, 0, 0],
      size: [width, height, depthOrArrayLayers],
    };
  };

  /**
   * Remove a volume from the atlas
   * TODO: shift the atlas texture to fill the gap
   * TODO: check if out of bounds to allow for 8,8,1 num threads
   * @param label - label of the volume to remove
   */
  const removeVolume = (label: string) => {
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
  };

  /**
   * @returns {GPUTextureView} - view of the atlas texture
   */
  const getAtlasTextureView = (): GPUTextureView => {
    const view = atlasTexture.createView();
    view.label = atlasTexture.label;
    return view;
  };

  return { addVolume, removeVolume, getAtlasTextureView };
};
