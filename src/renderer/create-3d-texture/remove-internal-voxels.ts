import removeInternalVoxelsCompute from "./remove-internal-voxels.compute.wgsl";
import { VOLUME_ATLAS_FORMAT } from "../constants";

export const removeInternalVoxels = (
  commandEncoder: GPUCommandEncoder,
  device: GPUDevice,
  volumeTexture: GPUTexture,
): GPUTexture => {
  const {
    width,
    height,
    depthOrArrayLayers,
    label,
    mipLevelCount,
    usage,
    format,
    dimension,
  } = volumeTexture;

  const outputTexture = device.createTexture({
    size: { width, height, depthOrArrayLayers },
    format,
    usage,
    dimension,
    label,
    mipLevelCount,
  });

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
          format,
          viewDimension: "3d",
        },
      },
    ],
  });

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var input : texture_3d<f32>;
        @group(0) @binding(1) var output : texture_storage_3d<${VOLUME_ATLAS_FORMAT}, write>;
        ${removeInternalVoxelsCompute}
        `,
      }),
      entryPoint: "main",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: volumeTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: 1,
        }),
      },
      {
        binding: 1,
        resource: outputTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: 1,
        }),
      },
    ],
  });

  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(pipeline);
  computePass.setBindGroup(0, bindGroup);
  const workGroupsX = Math.ceil(width / 4);
  const workGroupsY = Math.ceil(height / 4);
  const workGroupsZ = Math.ceil(depthOrArrayLayers / 4);
  computePass.dispatchWorkgroups(workGroupsX, workGroupsY, workGroupsZ);
  computePass.end();

  return outputTexture;
};
