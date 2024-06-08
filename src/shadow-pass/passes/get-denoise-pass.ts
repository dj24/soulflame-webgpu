import { device } from "../../app";
import { baseBindGroupLayoutEntries, code } from "../get-shadows-pass";

const intermediaryTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 9,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

export const getDenoisePass = async () => {
  const compositeBindGroupLayout = device.createBindGroupLayout({
    entries: [...baseBindGroupLayoutEntries, intermediaryTextureEntry],
  });

  const denoisePipeline = device.createComputePipeline({
    label: `diffuse - denoise`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [compositeBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "denoise",
    },
  });

  const getDenoiseBindGroup = (
    baseEntries: GPUBindGroupDescriptor["entries"],
    intermediaryTextureView: GPUTextureView,
    copyIntermediaryTextureView: GPUTextureView,
  ) => {
    return device.createBindGroup({
      layout: compositeBindGroupLayout,
      entries: [
        ...baseEntries,
        {
          binding: 2, // output texture
          resource: copyIntermediaryTextureView,
        },
        {
          binding: 9, // sampled texture
          resource: intermediaryTextureView,
        },
      ],
    });
  };

  let bindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    baseEntries: GPUBindGroupDescriptor["entries"],
    intermediaryTexture: GPUTexture,
    intermediaryTextureView: GPUTextureView,
    copyIntermediaryTextureView: GPUTextureView,
  ) => {
    if (!bindGroup) {
      bindGroup = getDenoiseBindGroup(
        baseEntries,
        intermediaryTextureView,
        copyIntermediaryTextureView,
      );
    }
    computePass.setPipeline(denoisePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(intermediaryTexture.width / 16),
      Math.ceil(intermediaryTexture.height / 8),
    );
  };

  return enqueuePass;
};
