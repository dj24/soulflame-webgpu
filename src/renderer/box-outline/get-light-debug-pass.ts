import { getViewMatrix, gpuContext, RenderArgs, RenderPass } from "../app";
import { getCuboidVertices } from "../primitive-meshes/cuboid";
import { mat4, Vec3 } from "wgpu-matrix";
import { VoxelObject } from "@renderer/voxel-object";
import { Transform } from "@renderer/components/transform";
import { Light } from "@renderer/components/light";
import { OUTPUT_TEXTURE_FORMAT } from "@renderer/constants";

const vertexStride = 16;

export const getLightDebugPass = async (
  device: GPUDevice,
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
          output.position = modelViewProjectionMatrix * objectPos;
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
          return vec4(10.0);
        }
        `,
      }),
      entryPoint: "main",
      targets: [
        {
          format: OUTPUT_TEXTURE_FORMAT,
        },
      ],
    },
    primitive: {
      // topology: "line-list",
      topology: "triangle-list",
      cullMode: "back",
    },
  });

  let verticesBuffer: GPUBuffer;
  let modelViewProjectionMatrixBuffer: GPUBuffer;
  let lastFrameObjectCount = 0;

  const render = ({
    commandEncoder,
    camera,
    timestampWrites,
    cameraTransform,
    ecs,
  }: RenderArgs) => {
    let bindGroups: GPUBindGroup[] = [];
    const renderableEntities = ecs.getEntitiesithComponent(Light);

    if (!verticesBuffer || renderableEntities.size !== lastFrameObjectCount) {
      lastFrameObjectCount = renderableEntities.size;
      verticesBuffer = device.createBuffer({
        size: vertexStride * verticesPerMesh * renderableEntities.size,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        label: "vertices buffer",
      });

      modelViewProjectionMatrixBuffer = device.createBuffer({
        size: 256 * renderableEntities.size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: "mvp buffer",
      });
    }

    renderableEntities.forEach((entity, i) => {
      const transform = ecs.getComponents(entity).get(Transform);
      const light = ecs.getComponents(entity).get(Light);
      const color = light.color;
      const vertices = getCuboidVertices([0.01, 0.01, 0.01]);
      const bufferOffset = i * 256;
      device.queue.writeBuffer(
        verticesBuffer,
        i * vertexStride * verticesPerMesh,
        vertices.buffer,
        0,
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

      const m = transform.transform;
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        getViewMatrix(cameraTransform),
      );
      const mvp = new Float32Array(mat4.mul(vp, m));
      device.queue.writeBuffer(
        modelViewProjectionMatrixBuffer,
        bufferOffset,
        mvp.buffer,
        0,
      );
    });

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
    bindGroups.forEach((bindGroup, i) => {
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setVertexBuffer(
        0,
        verticesBuffer,
        vertexStride * verticesPerMesh * i,
        vertexStride * verticesPerMesh,
      );
      passEncoder.draw(verticesPerMesh);
    });
    passEncoder.end();
  };

  return { render, label: "light debug" };
};
