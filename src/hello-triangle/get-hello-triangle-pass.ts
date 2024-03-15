import { camera, debugValues, device, RenderArgs, RenderPass } from "../app";
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

  return new Float32Array([
    // Back face
    ...bottomLeftBack,
    ...topLeftBack,
    ...bottomRightBack,
    ...bottomRightBack,
    ...topLeftBack,
    ...topRightBack,
    // Front face
    ...bottomLeftFront,
    ...bottomRightFront,
    ...topLeftFront,
    ...topLeftFront,
    ...bottomRightFront,
    ...topRightFront,
    // Top face
    ...topLeftBack,
    ...topLeftFront,
    ...topRightBack,
    ...topRightBack,
    ...topLeftFront,
    ...topRightFront,
    // Bottom face
    ...bottomLeftBack,
    ...bottomRightBack,
    ...bottomLeftFront,
    ...bottomLeftFront,
    ...bottomRightBack,
    ...bottomRightFront,
    // Right face
    ...bottomRightBack,
    ...topRightBack,
    ...bottomRightFront,
    ...bottomRightFront,
    ...topRightBack,
    ...topRightFront,
    // Left face
    ...bottomLeftBack,
    ...bottomLeftFront,
    ...topLeftBack,
    ...topLeftBack,
    ...bottomLeftFront,
    ...topLeftFront,
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

  const cubeVertexPositions = getCuboidVertices(voxelObjects[0].size);

  const verticesBuffer = device.createBuffer({
    size: cubeVertexPositions.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexPositions);
  verticesBuffer.unmap();

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
      cullMode: "front",
    },
  });

  let modelViewProjectionMatrixBuffer: GPUBuffer;
  let modelMatrixBuffer: GPUBuffer;
  let voxelObjectBuffer: GPUBuffer;

  const render = ({
    commandEncoder,
    outputTextures,
    transformationMatrixBuffer,
    voxelTextureView,
    viewProjectionMatricesBuffer,
    timestampWrites,
    cameraPositionBuffer,
  }: RenderArgs) => {
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: outputTextures.finalTexture.createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      timestampWrites,
    };

    const m = voxelObjects[0].transform;

    // const m = mat4.identity();
    // mat4.translate(m, [debugValues.translateX * 100, 0, 0], m);
    // mat4.uniformScale(m, debugValues.scale, m);

    // const scale = voxelObjects[0].size;
    // mat4.scale(modelMatrix, [debugValues.scale, 1, 1], modelMatrix);
    // mat4.translate(modelMatrix, [debugValues.translateX, 0, 0], modelMatrix);

    const vp = mat4.mul(
      mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
      camera.viewMatrix,
    );

    const modelViewProjectionMatrix = mat4.mul(vp, m);

    if (!modelViewProjectionMatrixBuffer) {
      modelViewProjectionMatrixBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(
      modelViewProjectionMatrixBuffer,
      0,
      new Float32Array(modelViewProjectionMatrix),
    );

    if (!modelMatrixBuffer) {
      modelMatrixBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(modelMatrixBuffer, 0, new Float32Array(m));

    if (!voxelObjectBuffer) {
      voxelObjectBuffer = device.createBuffer({
        size: 288,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(
      voxelObjectBuffer,
      0,
      new Float32Array(voxelObjects[0].toArray()),
    );

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
            buffer: modelMatrixBuffer,
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
          },
        },
      ],
    });

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setPipeline(pipeline);
    passEncoder.draw(cubeVertexPositions.length / 4);
    passEncoder.end();

    return [commandEncoder.finish()];
  };

  return { render, label: "hello triangle" };
};
