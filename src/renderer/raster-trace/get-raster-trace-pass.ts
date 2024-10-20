import {
  device,
  getViewMatrix,
  RenderArgs,
  RenderPass,
  VOXEL_OBJECT_STRUCT_SIZE,
} from "../app";
import redFrag from "./red.frag.wgsl";
import triangleVert from "./triangle.vert.wgsl";
import { mat4 } from "wgpu-matrix";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import { getCuboidVertices } from "../primitive-meshes/cuboid";
import { VoxelObject } from "@renderer/voxel-object";
import { Transform } from "@renderer/components/transform";

const MVP_BUFFER_STRIDE = 64;

export const getRasterTracePass = async (): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Model view projection matrix
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
        buffer: {
          type: "uniform",
        },
      },
      // Octree buffer
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Voxel objects
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Camera position
      {
        binding: 4,
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
        code: `
        ${getRayDirection}
        ${triangleVert}`,
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
        ${getRayDirection}
        ${boxIntersection}
        ${raymarchVoxels}
        ${redFrag}
        `,
      }),
      entryPoint: "main",
      targets: [
        // albedo
        { format: "rgba16float" },
        // normal
        { format: "rgba16float" },
        // world position
        { format: "rgba32float" },
        // velocity
        { format: "rgba16float" },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "front",
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth32float",
    },
  });

  const render = ({
    commandEncoder,
    outputTextures,
    volumeAtlas,
    viewProjectionMatricesBuffer,
    timestampWrites,
    cameraPositionBuffer,
    renderableEntities,
    ecs,
    camera,
    cameraTransform,
    transformationMatrixBuffer,
  }: RenderArgs) => {
    const colorAttachments: GPURenderPassColorAttachment[] = [
      {
        view: outputTextures.albedoTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
      {
        view: outputTextures.normalTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
      {
        view: outputTextures.worldPositionTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
      {
        view: outputTextures.velocityTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ];

    const depthStencilAttachment: GPURenderPassDepthStencilAttachment = {
      view: outputTextures.depthTexture.view,
      depthClearValue: 1.0,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    };

    const verticesBuffer = device.createBuffer({
      size: 576 * renderableEntities.length,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: "vertices buffer",
    });
    const modelViewProjectionMatrixBuffer = device.createBuffer({
      size: MVP_BUFFER_STRIDE * renderableEntities.length,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: "mvp buffer",
    });

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: modelViewProjectionMatrixBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: volumeAtlas.octreeBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
      ],
    });
    for (let i = 0; i < renderableEntities.length; i++) {
      const transform = ecs.getComponents(renderableEntities[i]).get(Transform);
      const voxelObject = ecs
        .getComponents(renderableEntities[i])
        .get(VoxelObject);

      const m = transform.transform;
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        getViewMatrix(cameraTransform),
      );
      const mvp = new Float32Array(mat4.mul(vp, m));
      device.queue.writeBuffer(
        modelViewProjectionMatrixBuffer,
        MVP_BUFFER_STRIDE * i,
        mvp.buffer,
        mvp.byteOffset,
        mvp.byteLength,
      );
      const vertices = new Float32Array(getCuboidVertices(voxelObject.size));
      device.queue.writeBuffer(
        verticesBuffer,
        576 * i,
        vertices.buffer,
        vertices.byteOffset,
        vertices.byteLength,
      );
    }

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments,
      depthStencilAttachment,
      timestampWrites,
    });
    passEncoder.setPipeline(pipeline);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(36, renderableEntities.length, 0, 0);
    passEncoder.end();
  };

  return { render, label: "raster trace" };
};
