import { device } from "../../app";
import { baseBindGroupLayoutEntries, shadowCode } from "../get-shadows-pass";

const intermediaryTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 9,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

export const getCompositePass = async () => {
  const compositeBindGroupLayout = device.createBindGroupLayout({
    entries: [...baseBindGroupLayoutEntries, intermediaryTextureEntry],
  });

  const compositePipeline = await device.createComputePipelineAsync({
    label: "diffuse - composite",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [compositeBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: shadowCode,
      }),
      entryPoint: "composite",
    },
  });

  const getCompositeBindGroup = (
    baseEntries: GPUBindGroupDescriptor["entries"],
    finalTextureView: GPUTextureView,
    copyIntermediaryTextureView: GPUTextureView,
  ) => {
    return device.createBindGroup({
      layout: compositeBindGroupLayout,
      entries: [
        ...baseEntries,
        {
          binding: 2, // output texture
          resource: finalTextureView,
        },
        {
          binding: 9, // sampled texture
          resource: copyIntermediaryTextureView,
        },
      ],
    });
  };

  let compositeBindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    baseEntries: GPUBindGroupDescriptor["entries"],
    finalTexture: GPUTexture,
    finalTextureView: GPUTextureView,
    copyIntermediaryTextureView: GPUTextureView,
  ) => {
    if (!compositeBindGroup) {
      compositeBindGroup = getCompositeBindGroup(
        baseEntries,
        finalTextureView,
        copyIntermediaryTextureView,
      );
    }
    computePass.setPipeline(compositePipeline);
    computePass.setBindGroup(0, compositeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(finalTexture.width / 16),
      Math.ceil(finalTexture.height / 8),
    );
  };

  return enqueuePass;
};
