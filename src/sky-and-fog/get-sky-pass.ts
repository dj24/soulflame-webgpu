import { device, RenderArgs, RenderPass } from "../app";
// import sky from "./sky.wgsl";
import sky from "./sky-clouds.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import { createTextureFromImage } from "webgpu-utils";

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

  const timeBufferEntry: GPUBindGroupLayoutEntry = {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  };

  const blueNoiseTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  };

  const pebbleTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 7,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  };

  const linearSamplerEntry: GPUBindGroupLayoutEntry = {
    binding: 8,
    visibility: GPUShaderStage.COMPUTE,
    sampler: {},
  };

  const cameraPositionEntry: GPUBindGroupLayoutEntry = {
    binding: 9,
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
      timeBufferEntry,
      blueNoiseTextureEntry,
      pebbleTextureEntry,
      linearSamplerEntry,
      cameraPositionEntry,
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

  const linearSampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  const pebbleTexture = await createTextureFromImage(device, "pebbles.png", {
    usage: GPUTextureUsage.COPY_SRC,
  });

  const rgbaNoiseTexture = await createTextureFromImage(
    device,
    "rgba-noise.png",
    {
      usage: GPUTextureUsage.COPY_SRC,
    },
  );

  const render = ({
    outputTextures,
    timestampWrites,
    viewProjectionMatricesBuffer,
    sunDirectionBuffer,
    timeBuffer,
    cameraPositionBuffer,
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
          resource: outputTextures.depthTexture.createView(),
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
        {
          binding: 5,
          resource: {
            buffer: timeBuffer,
          },
        },
        {
          binding: 6,
          resource: rgbaNoiseTexture.createView(),
        },
        {
          binding: 7,
          resource: pebbleTexture.createView(),
        },
        {
          binding: 8,
          resource: linearSampler,
        },
        {
          binding: 9,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
      ],
    });
    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    const downscaledWidth = Math.ceil(outputTextures.depthTexture.width / 2);
    const downscaledHeight = Math.ceil(outputTextures.depthTexture.height / 2);
    const workgroupsX = Math.ceil(downscaledWidth / 8);
    const workgroupsY = Math.ceil(downscaledHeight / 8);
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
    computePass.end();

    return [commandEncoder.finish()];
  };
  return { render, label: "sky and fog" };
};
