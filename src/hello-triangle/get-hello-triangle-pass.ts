import {
  camera,
  debugValues,
  device,
  RenderArgs,
  RenderPass,
  resolution,
} from "../app";
import redFrag from "./red.frag.wgsl";
import triangleVert from "./triangle.vert.wgsl";
import { mat4, Vec3, vec3 } from "wgpu-matrix";
import { voxelObjects } from "../create-tavern";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import { getCuboidVertices } from "../primitive-meshes/cuboid";
import { VoxelObject } from "../voxel-object";

const VOXEL_OBJECT_STRUCT_SIZE = 512;

export const getHelloTrianglePass = async (): Promise<RenderPass> => {
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
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
        buffer: {
          type: "uniform",
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
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Camera position
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      // Palette texture
      {
        binding: 6,
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
        { format: "rgba8unorm" },
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
    transformationMatrixBuffer,
    volumeAtlas,
    viewProjectionMatricesBuffer,
    timestampWrites,
    cameraPositionBuffer,
  }: RenderArgs) => {
    const sortedVoxelObjectsFrontToBack = voxelObjects;

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
      size: 576 * sortedVoxelObjectsFrontToBack.length,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: "vertices buffer",
    });
    const modelViewProjectionMatrixBuffer = device.createBuffer({
      size: 256 * sortedVoxelObjectsFrontToBack.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "mvp buffer",
    });
    const voxelObjectBuffer = device.createBuffer({
      size: VOXEL_OBJECT_STRUCT_SIZE * sortedVoxelObjectsFrontToBack.length,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: "voxel objects in raster",
    });

    let bindGroups = [];

    for (let i = 0; i < sortedVoxelObjectsFrontToBack.length; i++) {
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
            binding: 2,
            resource: {
              buffer: viewProjectionMatricesBuffer,
            },
          },
          {
            binding: 3,
            resource: volumeAtlas.atlasTextureView,
          },
          {
            binding: 4,
            resource: {
              buffer: voxelObjectBuffer,
              offset: VOXEL_OBJECT_STRUCT_SIZE * i,
            },
          },
          {
            binding: 5,
            resource: {
              buffer: cameraPositionBuffer,
            },
          },
          {
            binding: 6,
            resource: volumeAtlas.paletteTextureView,
          },
        ],
      });
      bindGroups.push(bindGroup);

      const voxelObject = sortedVoxelObjectsFrontToBack[i];
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        camera.viewMatrix,
      );
      const mvp = new Float32Array(mat4.mul(vp, voxelObject.transform));
      device.queue.writeBuffer(
        modelViewProjectionMatrixBuffer,
        256 * i,
        mvp.buffer,
        mvp.byteOffset,
        mvp.byteLength,
      );
      const object = new Float32Array(voxelObject.toArray());
      device.queue.writeBuffer(
        voxelObjectBuffer,
        VOXEL_OBJECT_STRUCT_SIZE * i,
        object.buffer,
        object.byteOffset,
        object.byteLength,
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

    for (let i = 0; i < sortedVoxelObjectsFrontToBack.length; i++) {
      const bindGroup = bindGroups[i];
      passEncoder.setVertexBuffer(0, verticesBuffer, 576 * i, 576);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(36);
    }

    passEncoder.end();

    // commandEncoder.copyTextureToTexture(
    //   {
    //     texture: outputTextures.albedoTexture.texture,
    //   },
    //   {
    //     texture: outputTextures.finalTexture.texture,
    //   },
    //   {
    //     width: outputTextures.finalTexture.width,
    //     height: outputTextures.finalTexture.height,
    //     depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
    //   },
    // );

    return [commandEncoder.finish()];
  };

  return { render, label: "hello triangle" };
};
