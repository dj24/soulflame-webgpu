import { getViewMatrix, gpuContext, RenderArgs, RenderPass } from "../app";
import { getCuboidVertices } from "../primitive-meshes/cuboid";
import { mat4 } from "wgpu-matrix";
import { VoxelObject } from "@renderer/voxel-object";

const vertexStride = 16;

export const getBoxOutlinePass = async (
  device: GPUDevice,
  voxelObjects: VoxelObject[],
): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const verticesPerMesh = getCuboidVertices([1, 1, 1]).length;

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: `
        @binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
        
        struct VertexOutput {
          @builtin(position) position : vec4f,
        }
        
        @vertex
        fn main(
          @location(0) objectPos : vec4f,
        ) -> VertexOutput {
          var output : VertexOutput;
          output.position =modelViewProjectionMatrix * objectPos;
          return output;
        }

       `,
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
        @fragment
        fn main() -> @location(0) vec4f {
          return vec4(1);
        }
        `,
      }),
      entryPoint: "main",
      targets: [
        {
          format: "bgra8unorm",
        },
      ],
    },
    primitive: {
      topology: "line-list",
      // topology: "triangle-list",
      cullMode: "back",
    },
  });

  const verticesBuffer = device.createBuffer({
    size: vertexStride * verticesPerMesh * voxelObjects.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    label: "vertices buffer",
  });

  const modelViewProjectionMatrixBuffer = device.createBuffer({
    size: 256 * voxelObjects.length,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: "mvp buffer",
  });

  const render = ({
    commandEncoder,
    camera,
    timestampWrites,
    cameraTransform,
  }: RenderArgs) => {
    let bindGroups = [];

    for (let i = 0; i < voxelObjects.length; i++) {
      // const vertices = getArrowMesh();
      const vertices = getCuboidVertices(voxelObjects[i].size);
      const bufferOffset = i * 256;
      device.queue.writeBuffer(
        verticesBuffer,
        i * vertexStride * verticesPerMesh,
        vertices.buffer,
        vertices.byteOffset,
      );
      // TODO: stop creating groups each frame
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
        ],
      });
      bindGroups.push(bindGroup);

      // const m = voxelObjects[i].transform;
      // TODO: wip
      const m = mat4.identity();
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        getViewMatrix(cameraTransform),
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
          view: gpuContext.getCurrentTexture().createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "load",
          storeOp: "store",
        },
      ],
      timestampWrites,
    });

    passEncoder.setPipeline(pipeline);
    for (let i = 0; i < voxelObjects.length; i++) {
      const bindGroup = bindGroups[i];
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setVertexBuffer(
        0,
        verticesBuffer,
        vertexStride * verticesPerMesh * i,
        vertexStride * verticesPerMesh,
      );
      passEncoder.draw(verticesPerMesh);
    }

    passEncoder.end();
  };

  return { render, label: "outlines" };
};
