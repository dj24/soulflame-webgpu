import { device } from "../../app";
import { baseBindGroupLayoutEntries, shadowCode } from "../get-shadows-pass";

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
        code: shadowCode,
      }),
      entryPoint: "denoise",
    },
  });

  const getDenoiseBindGroup = (
    baseEntries: GPUBindGroupDescriptor["entries"],
    inputTextureView: GPUTextureView,
    outputTextureView: GPUTextureView,
  ) => {
    return device.createBindGroup({
      layout: compositeBindGroupLayout,
      entries: [
        ...baseEntries,
        {
          binding: 2, // output texture
          resource: outputTextureView,
        },
        {
          binding: 9, // sampled texture
          resource: inputTextureView,
        },
      ],
    });
  };

  let bindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    baseEntries: GPUBindGroupDescriptor["entries"],
    inputTexture: GPUTexture,
    inputTextureView: GPUTextureView,
    outputTextureView: GPUTextureView,
  ) => {
    if (!bindGroup) {
      bindGroup = getDenoiseBindGroup(
        baseEntries,
        inputTextureView,
        outputTextureView,
      );
    }
    computePass.setPipeline(denoisePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(inputTexture.width / 16),
      Math.ceil(inputTexture.height / 8),
    );
  };

  return enqueuePass;
};
