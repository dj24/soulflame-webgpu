import { numMipLevels } from "webgpu-utils";
import generateMips from "./generate-mips.compute.wgsl";

export const generateOctreeMips = (
  commandEncoder: GPUCommandEncoder,
  device: GPUDevice,
  volume: GPUTexture,
): void => {
  const mipLevelCount = Math.min(
    numMipLevels(volume, "3d"),
    volume.mipLevelCount,
  );

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          viewDimension: "3d",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: "write-only",
          format: volume.format,
          viewDimension: "3d",
        },
      },
    ],
  });

  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
    console.debug(`Generating mip level ${mipLevel}`);
    // Use the previous mip, so that we do not need to check every voxel for every level
    const inputTextureView = volume.createView({
      baseMipLevel: mipLevel - 1,
      mipLevelCount: 1,
    });
    const outputTextureView = volume.createView({
      baseMipLevel: mipLevel,
      mipLevelCount: 1,
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: inputTextureView,
        },
        {
          binding: 1,
          resource: outputTextureView,
        },
      ],
    });

    const octreePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          code: generateMips,
        }),
        entryPoint: "main",
      },
    });
    //
    // const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(octreePipeline);
    computePass.setBindGroup(0, bindGroup);

    const widthAtMipLevel = Math.max(1, volume.width >> mipLevel);
    const heightAtMipLevel = Math.max(1, volume.height >> mipLevel);
    const depthAtMipLevel = Math.max(1, volume.depthOrArrayLayers >> mipLevel);

    const workGroupsX = Math.ceil(widthAtMipLevel / 4);
    const workGroupsY = Math.ceil(heightAtMipLevel / 4);
    const workGroupsZ = Math.ceil(depthAtMipLevel / 4);

    computePass.dispatchWorkgroups(workGroupsX, workGroupsY, workGroupsZ);

    computePass.end();
  }
};
