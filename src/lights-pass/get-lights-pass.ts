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
import randomCommon from "../random-common.wgsl";
import bvh from "../shader/bvh.wgsl";
import { getSphereVertices } from "../primitive-meshes/sphere";

type Light = {
  position: [number, number, number];
  size: number;
  color: [number, number, number];
};

const lights: Light[] = [
  {
    color: [0.0, 1.0, 0.0],
    position: [-12, 4.5, -45],
    size: 3,
  },
  {
    color: [1, 0, 0.0],
    position: [-10, 6.5, -45],
    size: 3,
  },
  {
    color: [0, 0, 1],
    position: [-24, 4.5, -45],
    size: 3,
  },
  {
    color: [0, 1, 0],
    position: [-28, 5.5, -42],
    size: 2,
  },
  {
    color: [1.0, 0.0, 0.0],
    position: [-32, 4.5, -43],
    size: 2.5,
  },
];

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

const lightStride = 48;
const vertexStride = 16;
const verticesPerLight = getSphereVertices(1).length;

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
        ${getRayDirection}
        ${randomCommon}
        ${boxIntersection}
        ${raymarchVoxels}
        ${bvh}
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
      cullMode: "front", // TODO: reverse faces and cull front so we can see the inside of the light volume
    },
  });

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
  });

  const verticesBuffer = device.createBuffer({
    size: vertexStride * verticesPerLight * lights.length,
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

  const render = ({
    commandEncoder,
    outputTextures,
    transformationMatrixBuffer,
    voxelTextureView,
    viewProjectionMatricesBuffer,
    timestampWrites,
    bvhBuffer,
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

    let bindGroups = [];

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const vertices = getSphereVertices(light.size);
      const bufferOffset = i * 256;
      device.queue.writeBuffer(
        verticesBuffer,
        i * vertexStride * verticesPerLight,
        vertices.buffer,
        vertices.byteOffset,
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
            resource: voxelTextureView,
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

    passEncoder.end();

    return [commandEncoder.finish()];
  };

  return { render, label: "lights" };
};
