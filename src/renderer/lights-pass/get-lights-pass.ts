import { RenderArgs, RenderPass } from "../app";
import { Vec3 } from "wgpu-matrix";
import lightsCompute from "./lights.compute.wgsl";

export type Light = {
  position: [number, number, number];
  size: number;
  color: [number, number, number] | Vec3;
};

const lightToArrayBuffer = (light: Light) => {
  const arrayBuffer = new ArrayBuffer(48);
  const lightDataView = new DataView(arrayBuffer);
  lightDataView.setFloat32(0, light.position[0], true);
  lightDataView.setFloat32(4, light.position[1], true);
  lightDataView.setFloat32(8, light.position[2], true);
  lightDataView.setFloat32(16, light.color[0], true);
  lightDataView.setFloat32(20, light.color[1], true);
  lightDataView.setFloat32(24, light.color[2], true);
  lightDataView.setFloat32(32, light.size, true);
  return arrayBuffer;
};

const LIGHT_BUFFER_STRIDE = 48;

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
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
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
  let lightPixelBuffer: GPUBuffer;

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
        ],
      });
    }

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const lightBufferOffset = i * LIGHT_BUFFER_STRIDE;

      device.queue.writeBuffer(
        lightBuffer,
        lightBufferOffset,
        lightToArrayBuffer(light),
      );
    }

    commandEncoder.clearBuffer(lightPixelBuffer);
    const passEncoder = commandEncoder.beginComputePass({ timestampWrites });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
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
