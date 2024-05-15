import { device, RenderArgs, RenderPass } from "../app";
import sky from "./sky-clouds.wgsl";
import randomCommon from "../random-common.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import { createTextureFromImage } from "webgpu-utils";
import { defaultUsage } from "../abstractions/g-buffer-texture";
import { OUTPUT_TEXTURE_FORMAT, SKYBOX_TEXTURE_FORMAT } from "../constants";

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
      format: OUTPUT_TEXTURE_FORMAT,
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

  const skyCubeTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
      viewDimension: "cube",
    },
  };

  const writeSkyCubeTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: SKYBOX_TEXTURE_FORMAT,
      viewDimension: "2d-array",
    },
  };

  const lastSkyTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
      viewDimension: "2d-array",
    },
  };

  const worldPosTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 10,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "unfilterable-float",
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
      worldPosTextureEntry,
    ],
  });

  const readSkyBindGroupLayout = device.createBindGroupLayout({
    entries: [skyCubeTextureEntry],
  });

  const writeSkyBindGroupLayout = device.createBindGroupLayout({
    entries: [writeSkyCubeTextureEntry, lastSkyTextureEntry],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, readSkyBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `${randomCommon}${getRayDirection}${sky}`,
      }),
      entryPoint: "main",
    },
  });

  const updateSkyboxPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, writeSkyBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `${randomCommon}${getRayDirection}${sky}`,
      }),
      entryPoint: "writeToCube",
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

  const lastSkyTexture = device.createTexture({
    size: [512, 512, 6],
    format: SKYBOX_TEXTURE_FORMAT,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });

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
          1,
        ],
        format: OUTPUT_TEXTURE_FORMAT,
        usage: defaultUsage,
      });
    }
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture.texture, // TODO: pass texture as well as view
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
          resource: outputTextures.depthTexture.view,
        },
        {
          binding: 1,
          resource: copyOutputTexture.createView(),
        },
        {
          binding: 2,
          resource: outputTextures.finalTexture.view,
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
        {
          binding: 10,
          resource: outputTextures.worldPositionTexture.view,
        },
      ],
    });

    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });
    computePass.setPipeline(updateSkyboxPipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.setBindGroup(
      1,
      device.createBindGroup({
        layout: writeSkyBindGroupLayout,
        entries: [
          {
            binding: 2,
            resource: outputTextures.skyTexture.createView({
              dimension: "2d-array",
            }),
          },
          {
            binding: 3,
            resource: lastSkyTexture.createView({
              dimension: "2d-array",
            }),
          },
        ],
      }),
    );
    computePass.dispatchWorkgroups(
      outputTextures.skyTexture.width / 16,
      outputTextures.skyTexture.height / 16,
      6,
    );

    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.setBindGroup(
      1,
      device.createBindGroup({
        layout: readSkyBindGroupLayout,
        entries: [
          {
            binding: 1,
            resource: outputTextures.skyTexture.createView({
              dimension: "cube",
            }),
          },
        ],
      }),
    );
    const downscaledWidth = outputTextures.depthTexture.width;
    const downscaledHeight = outputTextures.depthTexture.height;
    const workgroupsX = Math.ceil(downscaledWidth / 8);
    const workgroupsY = Math.ceil(downscaledHeight / 8);
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
    computePass.end();

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.skyTexture,
      },
      {
        texture: lastSkyTexture,
      },
      {
        width: outputTextures.skyTexture.width,
        height: outputTextures.skyTexture.height,
        depthOrArrayLayers: outputTextures.skyTexture.depthOrArrayLayers,
      },
    );

    return [commandEncoder.finish()];
  };
  return { render, label: "sky" };
};
