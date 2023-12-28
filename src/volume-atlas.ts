import { vec3, Vec3 } from "wgpu-matrix";

/**
 * Factory function for creating and managing a volume atlas
 * The atlas is a 3d texture that contains multiple voxel models, packing them along the x-axis
 * TODO: allow for overflows into the y-axis, and perhaps z-axis
 * @param device - The GPU device
 * @returns { atlasTexture, addVolume, removeVolume }
 */
export const getVolumeAtlas = async (device: GPUDevice) => {
  let atlasTexture: GPUTexture = null;
  /**
   * Add a volume to the atlas
   * @param texture - 3d texture to copy into the atlas
   */
  const addVolume = async (texture: GPUTexture) => {
    const { width, height, depthOrArrayLayers } = texture;
    const atlasSize = vec3.create(
      atlasTexture.width,
      atlasTexture.height,
      atlasTexture.depthOrArrayLayers,
    );
    if (!atlasTexture) {
      atlasTexture = device.createTexture({
        size: { width, height, depthOrArrayLayers },
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        dimension: "3d",
      });
    } else {
      atlasTexture.destroy();
      atlasTexture = device.createTexture({
        size: {
          width: atlasSize[0] + width,
          height: Math.max(atlasSize[1], height),
          depthOrArrayLayers: Math.max(atlasSize[2], depthOrArrayLayers),
        },
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        dimension: "3d",
      });
    }
    const commandEncoder = device.createCommandEncoder();

    // TODO: see if we can copy multiple slices at once instead
    for (let i = 0; i < depthOrArrayLayers; i++) {
      commandEncoder.copyTextureToTexture(
        {
          texture,
          mipLevel: 0, // Assuming mip level 0 for simplicity
          origin: { x: 0, y: 0, z: i }, // Specify the source origin
        },
        {
          texture: atlasTexture!,
          mipLevel: 0, // Assuming mip level 0 for simplicity
          origin: { x: atlasSize[0], y: 0, z: i }, // Specify the destination origin (z-axis slice)
        },
        {
          width: atlasTexture!.width,
          height: atlasTexture!.height,
          depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
        },
      );
    }

    device.queue.submit([commandEncoder.finish()]);
  };

  /**
   * Remove a volume from the atlas
   * @param startIndex - start texel of the volume to remove
   * @param endIndex - end texel of the volume to remove
   */
  const removeVolume = async (startIndex: Vec3, endIndex: Vec3) => {};

  return { atlasTexture, addVolume, removeVolume };
};
