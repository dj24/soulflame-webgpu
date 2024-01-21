import { device, RenderArgs, RenderPass } from "../app";
import sky from "./sky.wgsl";

export const getSkyPass = async (): Promise<RenderPass> => {
  const depthEntry: GPUBindGroupLayoutEntry = {
    binding: 0,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "unfilterable-float",
    },
  };
  const outputTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8unorm",
      viewDimension: "2d",
    },
  };
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [depthEntry, outputTextureEntry],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: sky,
      }),
      entryPoint: "main",
    },
  });
  const render = ({ outputTextures, timestampWrites }: RenderArgs) => {
    const commandEncoder = device.createCommandEncoder();
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 1,
          resource: outputTextures.finalTexture.createView(),
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

    return commandEncoder.finish();
  };
  return { render, label: "sky and fog" };
};
