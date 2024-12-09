import { device, RenderArgs, RenderPass } from "../app";
import lightsShader from "./lights.wgsl";
import { Vec3 } from "wgpu-matrix";
import { Transform } from "@renderer/components/transform";
import { OUTPUT_TEXTURE_FORMAT } from "@renderer/constants";
import { Light } from "@renderer/components/light";

const LIGHT_BUFFER_STRIDE = 32;

export const getSimpleLightsPass = async (): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Lights
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Position texture
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
        },
      },
      // Normal texture
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
        },
      },
      // Albedo texture
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
        },
      },
      // Sampler
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {},
      },
      // Camera position
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: lightsShader,
      }),
      entryPoint: "vertex_main",
    },
    fragment: {
      module: device.createShaderModule({
        code: lightsShader,
      }),
      entryPoint: "fragment_main",
      targets: [
        // final
        {
          format: OUTPUT_TEXTURE_FORMAT,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        },
      ],
    },
  });

  let lightBuffer: GPUBuffer;
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const render = ({
    commandEncoder,
    outputTextures,
    timestampWrites,
    ecs,
    cameraPositionBuffer,
  }: RenderArgs) => {
    let lights: { position: Vec3; color: Vec3 }[] = [];
    ecs.getEntitiesithComponent(Light).forEach((entity) => {
      const transform = ecs.getComponents(entity).get(Transform);
      const light = ecs.getComponents(entity).get(Light);
      lights.push({
        position: transform.position,
        color: light.color,
      });
    });

    if (lights.length === 0) {
      return;
    }

    const colorAttachments: GPURenderPassColorAttachment[] = [
      {
        view: outputTextures.finalTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "load",
        storeOp: "store",
      },
    ];

    if (
      !lightBuffer ||
      lightBuffer.size !== LIGHT_BUFFER_STRIDE * lights.length
    ) {
      lightBuffer = device.createBuffer({
        size: LIGHT_BUFFER_STRIDE * lights.length,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: lightBuffer,
          },
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
          resource: outputTextures.albedoTexture.view,
        },
        {
          binding: 4,
          resource: sampler,
        },
        {
          binding: 5,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
      ],
    });

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments,
      timestampWrites,
    });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    // for (let i = 0; i < lights.length; i++) {
    passEncoder.draw(6, lights.length);
    // }
    passEncoder.end();
  };

  return { render, label: "simple lights" };
};
