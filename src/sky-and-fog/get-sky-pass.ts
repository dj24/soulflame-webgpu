import { device, RenderArgs, RenderPass } from "../app";
import sky from "./sky.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";

export const getSkyPass = async (): Promise<RenderPass> => {
  const depthEntry: GPUBindGroupLayoutEntry = {
    binding: 0,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "unfilterable-float",
    },
  };
  const inputTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  };

  const outputTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8unorm",
    },
  };

  const matricesEntry: GPUBindGroupLayoutEntry = {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  };

  const sunDirectionEntry: GPUBindGroupLayoutEntry = {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  };

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      depthEntry,
      inputTextureEntry,
      outputTextureEntry,
      matricesEntry,
      sunDirectionEntry,
    ],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `${getRayDirection}${sky}`,
      }),
      entryPoint: "main",
    },
  });

  let copyOutputTexture: GPUTexture;

  const render = ({
    outputTextures,
    timestampWrites,
    viewProjectionMatricesBuffer,
    sunDirectionBuffer,
  }: RenderArgs) => {
    if (!copyOutputTexture) {
      copyOutputTexture = device.createTexture({
        size: [
          outputTextures.finalTexture.width,
          outputTextures.finalTexture.height,
          outputTextures.finalTexture.depthOrArrayLayers,
        ],
        format: outputTextures.finalTexture.format,
        usage: outputTextures.finalTexture.usage,
      });
    }
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture, // TODO: pass texture as well as view
      },
      {
        texture: copyOutputTexture,
      },
      {
        width: outputTextures.finalTexture.width,
        height: outputTextures.finalTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 1,
          resource: copyOutputTexture.createView(),
        },
        {
          binding: 2,
          resource: outputTextures.finalTexture.createView(),
        },
        {
          binding: 3,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: sunDirectionBuffer,
          },
        },
      ],
    });
    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    const workgroupsX = Math.ceil(
      outputTextures.depthAndClusterTexture.width / 8,
    );
    const workgroupsY = Math.ceil(
      outputTextures.depthAndClusterTexture.height / 8,
    );
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
    computePass.end();

    return [commandEncoder.finish()];
  };
  return { render, label: "sky and fog" };
};
