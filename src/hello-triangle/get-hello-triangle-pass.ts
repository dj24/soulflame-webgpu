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

const getCuboidVertices = (size: Vec3) => {
  const [x, y, z] = size;

  const bottomLeftBack = [0, 0, 0, 1];
  const bottomRightBack = [x, 0, 0, 1];
  const topLeftBack = [0, y, 0, 1];
  const topRightBack = [x, y, 0, 1];
  const bottomLeftFront = [0, 0, z, 1];
  const bottomRightFront = [x, 0, z, 1];
  const topLeftFront = [0, y, z, 1];
  const topRightFront = [x, y, z, 1];

  let backFace = [
    bottomLeftBack,
    bottomRightBack,
    topLeftBack,
    topLeftBack,
    bottomRightBack,
    topRightBack,
  ].flat();

  let frontFace = [
    bottomLeftFront,
    topLeftFront,
    bottomRightFront,
    bottomRightFront,
    topLeftFront,
    topRightFront,
  ].flat();

  let topFace = [
    topLeftBack,
    topRightBack,
    topLeftFront,
    topLeftFront,
    topRightBack,
    topRightFront,
  ].flat();

  let bottomFace = [
    bottomLeftBack,
    bottomLeftFront,
    bottomRightBack,
    bottomRightBack,
    bottomLeftFront,
    bottomRightFront,
  ].flat();

  let rightFace = [
    bottomRightBack,
    bottomRightFront,
    topRightBack,
    topRightBack,
    bottomRightFront,
    topRightFront,
  ].flat();

  let leftFace = [
    bottomLeftBack,
    topLeftBack,
    bottomLeftFront,
    bottomLeftFront,
    topLeftBack,
    topLeftFront,
  ].flat();

  return new Float32Array([
    ...backFace,
    ...frontFace,
    ...topFace,
    ...bottomFace,
    ...rightFace,
    ...leftFace,
  ]);
};

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
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
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

  // const depthTexture = device.createTexture({
  //   size: resolution,
  //   format: "depth24plus",
  //   usage: GPUTextureUsage.RENDER_ATTACHMENT,
  // });

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
        {
          format: "rgba8unorm",
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "back",
    },
    // depthStencil: {
    //   depthWriteEnabled: true,
    //   depthCompare: "less",
    //   format: "depth24plus",
    // },
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
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      // depthStencilAttachment: {
      //   view: depthTexture.createView(),
      //   depthClearValue: 1.0,
      //   depthLoadOp: "clear",
      //   depthStoreOp: "store",
      // },
      timestampWrites,
    });
    passEncoder.setPipeline(pipeline);

    const cubeVertexPositions = getCuboidVertices(voxelObjects[0].size);
    const verticesBuffer = device.createBuffer({
      size: 576 * voxelObjects.length,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const modelViewProjectionMatrixBuffer = device.createBuffer({
      size: 256 * voxelObjects.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const modelMatrixBuffer = device.createBuffer({
      size: 256 * voxelObjects.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const voxelObjectBuffer = device.createBuffer({
      size: 512 * voxelObjects.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    let bindGroups = [];

    for (let i = 0; i < voxelObjects.length; i++) {
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
            resource: {
              buffer: modelMatrixBuffer,
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
            resource: voxelTextureView,
          },
          {
            binding: 4,
            resource: {
              buffer: voxelObjectBuffer,
              offset: 512 * i,
            },
          },
        ],
      });
      bindGroups.push(bindGroup);

      const voxelObject = voxelObjects[i];
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
      const m = new Float32Array(voxelObject.transform);
      device.queue.writeBuffer(
        modelMatrixBuffer,
        256 * i,
        m.buffer,
        m.byteOffset,
        m.byteLength,
      );
      const object = new Float32Array(voxelObject.toArray());
      device.queue.writeBuffer(
        voxelObjectBuffer,
        512 * i,
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

    for (let i = 0; i < voxelObjects.length; i++) {
      const bindGroup = bindGroups[i];
      passEncoder.setVertexBuffer(0, verticesBuffer, 576 * i, 576);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(36);
    }

    passEncoder.end();

    return [commandEncoder.finish()];
  };

  return { render, label: "hello triangle" };
};
