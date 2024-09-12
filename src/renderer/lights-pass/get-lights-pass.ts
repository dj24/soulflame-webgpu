import { getViewMatrix, RenderArgs, RenderPass } from "../app";
import lightsFrag from "./lights.frag.wgsl";
import lightsVert from "./lights.vert.wgsl";
import { mat4, Vec3 } from "wgpu-matrix";
import wireframeFrag from "./wireframe.frag.wgsl";
import { getSphereVertices } from "../primitive-meshes/sphere";
import { getCuboidVertices } from "../primitive-meshes/cuboid";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

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
  bindGroup,
  lights,
}: {
  passEncoder: GPURenderPassEncoder;
  pipeline: GPURenderPipeline;
  verticesBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  lights: Light[];
}) => {
  passEncoder.setPipeline(pipeline);
  passEncoder.setVertexBuffer(0, verticesBuffer);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.draw(verticesPerLight, lights.length, 0, 0);
};

const vertexStride = 16;
const sphereVertices = getSphereVertices(15);
const cubeVertices = getCuboidVertices([1, 1, 1]);
const verticesPerLight = sphereVertices.length;
const verticesPerCuboid = cubeVertices.length;

export const getLightsPass = async (device: GPUDevice): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    label: "lights-bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
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
      // Normal texture
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Light buffer
      {
        binding: 4,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: "read-only-storage",
        },
      },
      // View projection matrices
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
        code: lightsVert,
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
        code: lightsFrag,
      }),
      entryPoint: "main",
      targets: [
        {
          format: OUTPUT_TEXTURE_FORMAT,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
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
        code: lightsVert,
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
        code: wireframeFrag,
      }),
      entryPoint: "main",
      targets: [
        {
          format: OUTPUT_TEXTURE_FORMAT,
        },
      ],
    },
    primitive: {
      topology: "line-list",
      cullMode: "none",
    },
  });

  const lightCubePipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: lightsVert,
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
        code: wireframeFrag,
      }),
      entryPoint: "main",
      targets: [
        {
          format: OUTPUT_TEXTURE_FORMAT,
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "back",
    },
  });

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
  });

  let verticesBuffer: GPUBuffer;
  let lightVerticesBuffer: GPUBuffer;
  let lightBuffer: GPUBuffer;
  let modelViewProjectionMatrixBuffer: GPUBuffer;
  let bindGroup: GPUBindGroup;

  const render = ({
    commandEncoder,
    outputTextures,
    viewProjectionMatricesBuffer,
    timestampWrites,
    lights,
    camera,
    cameraTransform,
  }: RenderArgs) => {
    if (!verticesBuffer) {
      verticesBuffer = device.createBuffer({
        size: vertexStride * verticesPerLight * lights.length,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        label: "vertices",
      });
    }

    if (!lightVerticesBuffer) {
      lightVerticesBuffer = device.createBuffer({
        size: vertexStride * verticesPerCuboid * lights.length,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        label: "light-vertices",
      });
    }
    if (!lightBuffer) {
      lightBuffer = device.createBuffer({
        size: 256 * lights.length,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!modelViewProjectionMatrixBuffer) {
      modelViewProjectionMatrixBuffer = device.createBuffer({
        size: 256 * lights.length,
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
            resource: {
              buffer: modelViewProjectionMatrixBuffer,
            },
          },
          {
            binding: 1,
            resource: nearestSampler,
          },
          {
            binding: 2,
            resource: outputTextures.worldPositionTexture.view,
          },
          {
            binding: 3,
            resource: outputTextures.normalTexture.view,
          },
          {
            binding: 4,
            resource: {
              buffer: lightBuffer,
            },
          },
          {
            binding: 5,
            resource: {
              buffer: viewProjectionMatricesBuffer,
            },
          },
        ],
      });
    }

    device.queue.writeBuffer(verticesBuffer, 0, sphereVertices.buffer);
    device.queue.writeBuffer(lightVerticesBuffer, 0, cubeVertices.buffer);

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const mvpBufferOffset = i * 64;
      const lightBufferOffset = i * 48;

      device.queue.writeBuffer(
        lightBuffer,
        lightBufferOffset,
        lightToArrayBuffer(light),
      );

      const m = mat4.identity();
      mat4.translate(m, light.position, m);
      mat4.uniformScale(m, light.size, m);
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        getViewMatrix(cameraTransform),
      );
      const mvp = new Float32Array(mat4.mul(vp, m));
      device.queue.writeBuffer(
        modelViewProjectionMatrixBuffer,
        mvpBufferOffset,
        mvp.buffer,
        mvp.byteOffset,
        mvp.byteLength,
      );
    }

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: outputTextures.finalTexture.view,
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
      bindGroup,
      lights,
    });

    // passEncoder.setPipeline(lightCubePipeline);
    // for (let i = 0; i < lights.length; i++) {
    //   const bindGroup = bindGroups[i];
    //   passEncoder.setBindGroup(0, bindGroup);
    //   passEncoder.setVertexBuffer(
    //     0,
    //     lightVerticesBuffer,
    //     vertexStride * verticesPerCuboid * i,
    //     vertexStride * verticesPerCuboid,
    //   );
    //   passEncoder.draw(verticesPerCuboid);
    // }

    // drawLightSpheres({
    //   passEncoder,
    //   pipeline: wireFramePipeline,
    //   verticesBuffer,
    //   bindGroups,
    //   lights,
    // });

    passEncoder.end();
  };

  return { render, label: "lights" };
};
