import {
  camera,
  debugValues,
  device,
  RenderArgs,
  RenderPass,
  resolution,
} from "../app";
import lightsFrag from "./lights.frag.wgsl";
import lightsVert from "./lights.vert.wgsl";
import { mat4 } from "wgpu-matrix";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import { getCuboidVertices } from "../primitive-meshes/cuboid";
import { getSphereVertices } from "../primitive-meshes/sphere";

const light = {
  position: [-15, 3.5, -45],
  size: 2,
  color: [1, 1, 1],
  intensity: 1,
};

export const getLightsPass = async (): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {
          type: "non-filtering",
        },
      },
      // World positions texture
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "3d",
        },
      },
      // Albedo texture
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
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
        code: `
        ${lightsVert}`,
      }),
      entryPoint: "main",
      buffers: [
        {
          arrayStride: 16,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: "float32x4",
            },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({
        code: `
        ${lightsFrag}
        `,
      }),
      entryPoint: "main",
      targets: [
        // albedo
        { format: "rgba8unorm" },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "front", // TODO: reverse faces and cull front so we can see the inside of the light volume
    },
  });

  // const vertices = getCuboidVertices(light.size);
  const vertices = getSphereVertices(light.size);
  const verticesBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    verticesBuffer,
    0,
    vertices.buffer,
    vertices.byteOffset,
    vertices.byteLength,
  );

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
  });

  const render = ({
    commandEncoder,
    outputTextures,
    transformationMatrixBuffer,
    voxelTextureView,
    viewProjectionMatricesBuffer,
    timestampWrites,
    cameraPositionBuffer,
  }: RenderArgs) => {
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: outputTextures.finalTexture.createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "load",
          storeOp: "store",
        },
      ],
      timestampWrites,
    });
    passEncoder.setPipeline(pipeline);

    const modelViewProjectionMatrixBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    let bindGroups = [];

    for (let i = 0; i < 1; i++) {
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: modelViewProjectionMatrixBuffer,
              offset: 256 * i,
            },
          },
          {
            binding: 1,
            resource: nearestSampler,
          },
          {
            binding: 2,
            resource: outputTextures.worldPositionTexture.createView(),
          },
          {
            binding: 3,
            resource: voxelTextureView,
          },
          {
            binding: 4,
            resource: outputTextures.albedoTexture.createView(),
          },
        ],
      });
      bindGroups.push(bindGroup);

      const m = mat4.identity();
      mat4.translate(m, light.position, m);
      mat4.uniformScale(m, light.size, m);
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        camera.viewMatrix,
      );
      const mvp = new Float32Array(mat4.mul(vp, m));
      device.queue.writeBuffer(
        modelViewProjectionMatrixBuffer,
        256 * i,
        mvp.buffer,
        mvp.byteOffset,
        mvp.byteLength,
      );
    }

    const bindGroup = bindGroups[0];
    passEncoder.setVertexBuffer(0, verticesBuffer, 0, vertices.byteLength);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(vertices.length / 4);
    passEncoder.end();

    return [commandEncoder.finish()];
  };

  return { render, label: "lights" };
};
