import { RenderArgs, RenderPass } from "../app";
import { Vec3 } from "wgpu-matrix";
import lightsCompute from "./lights.compute.wgsl";

export type Light = {
  position: [number, number, number];
  size: number;
  color: [number, number, number] | Vec3;
};

const LIGHT_BUFFER_STRIDE = 32;

export const getLightsPass = async (device: GPUDevice): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    label: "lights-bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "non-filtering",
        },
      },
      // World positions texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      // Normal texture
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Light buffer
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Output texture
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba16float",
        },
      },
      // Pixel buffer
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      // Input texture
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });

  const lightConfigBindGroupLayout = device.createBindGroupLayout({
    label: "light-config-bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout, lightConfigBindGroupLayout],
  });

  const pipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: lightsCompute,
      }),
      entryPoint: "main",
    },
    layout: pipelineLayout,
  });

  const compositePipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: lightsCompute,
      }),
      entryPoint: "composite",
    },
    layout: pipelineLayout,
  });

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
  });

  let lightBuffer: GPUBuffer;
  let bindGroup: GPUBindGroup;
  let lightConfigBindGroup: GPUBindGroup;
  let lightPixelBuffer: GPUBuffer;
  let lightConfigBuffer: GPUBuffer;

  let lightConfig = {
    constantAttenuation: 0.0,
    linearAttenuation: 0.1,
    quadraticAttenuation: 0.1,
  };

  const folder = (window as any).debugUI.gui.addFolder("lighting");
  folder.add(lightConfig, "constantAttenuation", 1, 1.5, 0.1);
  folder.add(lightConfig, "linearAttenuation", 0.01, 1, 0.01);
  folder.add(lightConfig, "quadraticAttenuation", 0.005, 0.1, 0.001);

  const render = ({
    commandEncoder,
    outputTextures,
    timestampWrites,
    lights,
  }: RenderArgs) => {
    // TODO: account for resolution changes
    if (!lightPixelBuffer) {
      const downscaledWidth = Math.ceil(outputTextures.finalTexture.width / 2);
      const downscaledHeight = Math.ceil(
        outputTextures.finalTexture.height / 2,
      );
      const stride = 8;
      lightPixelBuffer = device.createBuffer({
        label: "light-pixel-buffer",
        size: stride * downscaledWidth * downscaledHeight,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!lightConfigBuffer) {
      const stride = 4;
      lightConfigBuffer = device.createBuffer({
        label: "light-config-buffer",
        size: stride * 3,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(
      lightConfigBuffer,
      0,
      new Float32Array([
        lightConfig.constantAttenuation,
        lightConfig.linearAttenuation,
        lightConfig.quadraticAttenuation,
      ]),
    );

    if (!lightBuffer) {
      const stride = LIGHT_BUFFER_STRIDE;
      lightBuffer = device.createBuffer({
        size: LIGHT_BUFFER_STRIDE * lights.length,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!bindGroup) {
      bindGroup = device.createBindGroup({
        label: "lights-bind-group",
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: nearestSampler,
          },
          {
            binding: 1,
            resource: outputTextures.worldPositionTexture.view,
          },
          {
            binding: 2,
            resource: outputTextures.normalTexture.view,
          },
          {
            binding: 3,
            resource: {
              buffer: lightBuffer,
            },
          },
          {
            binding: 4,
            resource: outputTextures.finalTexture.view,
          },
          {
            binding: 5,
            resource: {
              buffer: lightPixelBuffer,
            },
          },
          {
            binding: 6,
            resource: outputTextures.albedoTexture.view,
          },
        ],
      });
    }

    if (!lightConfigBindGroup) {
      lightConfigBindGroup = device.createBindGroup({
        label: "light-config-bind-group",
        layout: lightConfigBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: lightConfigBuffer,
            },
          },
        ],
      });
    }

    const arrayBuffer = new ArrayBuffer(LIGHT_BUFFER_STRIDE * lights.length);
    const lightDataView = new DataView(arrayBuffer);

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const lightBufferOffset = i * LIGHT_BUFFER_STRIDE;
      lightDataView.setFloat32(lightBufferOffset, light.position[0], true);
      lightDataView.setFloat32(lightBufferOffset + 4, light.position[1], true);
      lightDataView.setFloat32(lightBufferOffset + 8, light.position[2], true);
      lightDataView.setFloat32(lightBufferOffset + 16, light.color[0], true);
      lightDataView.setFloat32(lightBufferOffset + 20, light.color[1], true);
      lightDataView.setFloat32(lightBufferOffset + 24, light.color[2], true);
    }
    device.queue.writeBuffer(lightBuffer, 0, arrayBuffer);

    commandEncoder.clearBuffer(lightPixelBuffer);
    const passEncoder = commandEncoder.beginComputePass({ timestampWrites });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setBindGroup(1, lightConfigBindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(outputTextures.finalTexture.width / 32),
      Math.ceil(outputTextures.finalTexture.width / 32),
      lights.length,
    );

    passEncoder.setPipeline(compositePipeline);
    passEncoder.dispatchWorkgroups(
      Math.ceil(outputTextures.finalTexture.width / 8),
      Math.ceil(outputTextures.finalTexture.width / 8),
      1,
    );
    passEncoder.end();
  };

  return { render, label: "lights" };
};
