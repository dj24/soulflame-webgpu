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
import { mat4, Vec3, vec3 } from "wgpu-matrix";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import wireframeFrag from "./wireframe.frag.wgsl";
import randomCommon from "../random-common.wgsl";
import bvh from "../shader/bvh.wgsl";
import bvhCoarse from "../shader/bvh-coarse.wgsl";
import { getSphereVertices } from "../primitive-meshes/sphere";
import { getCuboidVertices } from "../primitive-meshes/cuboid";

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

const drawLightSpheres = ({
  passEncoder,
  pipeline,
  verticesBuffer,
  bindGroups,
  lights,
}: {
  passEncoder: GPURenderPassEncoder;
  pipeline: GPURenderPipeline;
  verticesBuffer: GPUBuffer;
  bindGroups: GPUBindGroup[];
  lights: Light[];
}) => {
  passEncoder.setPipeline(pipeline);
  for (let i = 0; i < lights.length; i++) {
    const bindGroup = bindGroups[i];
    passEncoder.setVertexBuffer(
      0,
      verticesBuffer,
      vertexStride * verticesPerLight * i,
      vertexStride * verticesPerLight,
    );
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(verticesPerLight);
  }
};

const lightStride = 48;
const vertexStride = 16;
const verticesPerLight = getSphereVertices(1).length;
const verticesPerCuboid = getCuboidVertices([1, 1, 1]).length;

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
      // Transformation matrices
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
        },
      },
      // BVH buffer
      {
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Normal texture
      {
        binding: 7,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Light buffer
      {
        binding: 8,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      // View projection matrices
      {
        binding: 9,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      // depth texture
      {
        binding: 10,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      // brick map
      {
        binding: 11,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
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
          arrayStride: vertexStride,
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
        @group(0) @binding(11) var<storage> brickBuffer: array<Brick>;
        ${getRayDirection}
        ${randomCommon}
        ${boxIntersection}
        ${raymarchVoxels}
        ${bvh}
        ${bvhCoarse}
        ${lightsFrag}
        `,
      }),
      entryPoint: "main",
      targets: [
        // albedo
        {
          format: "rgba8unorm",
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "dst-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
            },
          },
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "front",
    },
  });

  const wireFramePipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: `
        ${lightsVert}`,
      }),
      entryPoint: "main",
      buffers: [
        {
          arrayStride: vertexStride,
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
        ${wireframeFrag}
        `,
      }),
      entryPoint: "main",
      targets: [
        // albedo
        {
          format: "rgba8unorm",
        },
      ],
    },
    primitive: {
      topology: "line-list",
      cullMode: "back",
    },
  });

  const lightCubePipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: `
        ${lightsVert}`,
      }),
      entryPoint: "main",
      buffers: [
        {
          arrayStride: vertexStride,
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
        ${wireframeFrag}
        `,
      }),
      entryPoint: "main",
      targets: [
        // albedo
        {
          format: "rgba8unorm",
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "front",
    },
  });

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
  });

  const render = ({
    commandEncoder,
    outputTextures,
    transformationMatrixBuffer,
    volumeAtlas,
    viewProjectionMatricesBuffer,
    timestampWrites,
    bvhBuffer,
    lights,
  }: RenderArgs) => {
    let bindGroups = [];

    const verticesBuffer = device.createBuffer({
      size: vertexStride * verticesPerLight * lights.length,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const lightVerticesBuffer = device.createBuffer({
      size: vertexStride * verticesPerCuboid * lights.length,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const lightBuffer = device.createBuffer({
      size: 256 * lights.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const modelViewProjectionMatrixBuffer = device.createBuffer({
      size: 256 * lights.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const vertices = getSphereVertices(light.size);
      const cubeSize = 0.125;
      const cubeVertices = getCuboidVertices([
        cubeSize,
        cubeSize,
        cubeSize,
      ]).map((v) => {
        return v - cubeSize / 2;
      });

      const bufferOffset = i * 256;
      device.queue.writeBuffer(
        verticesBuffer,
        i * vertexStride * verticesPerLight,
        vertices.buffer,
        vertices.byteOffset,
      );
      device.queue.writeBuffer(
        lightVerticesBuffer,
        i * vertexStride * verticesPerCuboid,
        cubeVertices.buffer,
        cubeVertices.byteOffset,
      );
      device.queue.writeBuffer(
        lightBuffer,
        bufferOffset,
        lightToArrayBuffer(light),
      );
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: modelViewProjectionMatrixBuffer,
              offset: bufferOffset,
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
            resource: volumeAtlas.getAtlasTextureView(),
          },
          {
            binding: 4,
            resource: outputTextures.albedoTexture.createView(),
          },
          {
            binding: 5,
            resource: {
              buffer: transformationMatrixBuffer,
            },
          },
          {
            binding: 6,
            resource: {
              buffer: bvhBuffer,
            },
          },
          {
            binding: 7,
            resource: outputTextures.normalTexture.createView(),
          },
          {
            binding: 8,
            resource: {
              buffer: lightBuffer,
              offset: bufferOffset,
            },
          },
          {
            binding: 9,
            resource: {
              buffer: viewProjectionMatricesBuffer,
            },
          },
          {
            binding: 10,
            resource: outputTextures.depthTexture.createView(),
          },
          {
            binding: 11,
            resource: {
              buffer: volumeAtlas.getBrickMapBuffer(),
            },
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
        bufferOffset,
        mvp.buffer,
        mvp.byteOffset,
        mvp.byteLength,
      );
    }

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

    drawLightSpheres({
      passEncoder,
      pipeline,
      verticesBuffer,
      bindGroups,
      lights,
    });

    passEncoder.setPipeline(lightCubePipeline);
    for (let i = 0; i < lights.length; i++) {
      const bindGroup = bindGroups[i];
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setVertexBuffer(
        0,
        lightVerticesBuffer,
        vertexStride * verticesPerCuboid * i,
        vertexStride * verticesPerCuboid,
      );
      passEncoder.draw(verticesPerCuboid);
    }

    drawLightSpheres({
      passEncoder,
      pipeline: wireFramePipeline,
      verticesBuffer,
      bindGroups,
      lights,
    });

    passEncoder.end();

    return [commandEncoder.finish()];
  };

  return { render, label: "lights" };
};
