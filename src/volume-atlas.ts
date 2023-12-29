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
/**
 * Factory function for creating and managing a volume atlas
 * The atlas is a 3d texture that contains multiple voxel models, packing them along the x-axis
 * TODO: allow for overflows into the y-axis, and perhaps z-axis
 * @param device - The GPU device
 * @returns { atlasTexture, addVolume, removeVolume }
 */
export const getVolumeAtlas = (device: GPUDevice) => {
  let atlasTexture: GPUTexture = null;
  /**
   * Add a volume to the atlas
   * @param texture - 3d texture to copy into the atlas
   */
  const addVolume = (texture: GPUTexture) => {
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

    const commandEncoder = device.createCommandEncoder();
    const newWidth = atlasTexture.width + width;
    const label = atlasTexture.label;
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
      label: `${label}, ${texture.label || "unnamed volume"}`,
    });
    // Copy the old atlas texture into the new larger one
    commandEncoder.copyTextureToTexture(
      {
        texture: atlasTexture,
        mipLevel: 0, // Assuming mip level 0 for simplicity
        origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
      },
      {
        texture: newAtlasTexture,
        mipLevel: 0, // Assuming mip level 0 for simplicity
        origin: { x: 0, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
      },
      {
        width: atlasTexture.width,
        height: atlasTexture.height,
        depthOrArrayLayers: atlasTexture.depthOrArrayLayers,
      },
    );
    atlasTexture = newAtlasTexture;
    commandEncoder.copyTextureToTexture(
      {
        texture,
        mipLevel: 0, // Assuming mip level 0 for simplicity
        origin: { x: 0, y: 0, z: 0 }, // Specify the source origin
      },
      {
        texture: newAtlasTexture,
        mipLevel: 0, // Assuming mip level 0 for simplicity
        origin: { x: atlasTexture.width - width - 1, y: 0, z: 0 }, // Specify the destination origin (z-axis slice)
      },
      {
        width,
        height,
        depthOrArrayLayers,
      },
    );
    device.queue.submit([commandEncoder.finish()]);
    oldAtlasTexture.destroy();
  };

  /**
   * Remove a volume from the atlas
   * TODO: shift the atlas texture to fill the gap
   * TODO: check if out of bounds to allow for 8,8,1 num threads
   * @param startIndex - start texel of the volume to remove
   * @param endIndex - end texel of the volume to remove
   */
  const removeVolume = (startIndex: Vec3, endIndex: Vec3) => {
    if (!atlasTexture) {
      throw new Error(
        "Error removing from atlas: No atlas texture to remove volume from",
      );
    }
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
    return atlasTexture.createView();
  };

  return { addVolume, removeVolume, getAtlasTextureView };
};
