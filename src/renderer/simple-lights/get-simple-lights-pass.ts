import {
  device,
  getViewMatrix,
  RenderArgs,
  RenderPass,
  VOXEL_OBJECT_STRUCT_SIZE,
} from "../app";
import lightsShader from "./lights.wgsl";
import { mat4 } from "wgpu-matrix";
import { VoxelObject } from "@renderer/voxel-object";
import { Transform } from "@renderer/components/transform";
import { OUTPUT_TEXTURE_FORMAT } from "@renderer/constants";

const MVP_BUFFER_STRIDE = 64;
const vertexStride = 16;

export const getSimpleLightsPass = async (): Promise<RenderPass> => {
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: lightsShader,
      }),
      entryPoint: "vertex_main",
    },
    fragment: {
      module: device.createShaderModule({
        code: lightsShader,
      }),
      entryPoint: "fragment_main",
      targets: [
        // final
        { format: OUTPUT_TEXTURE_FORMAT },
      ],
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
    timeBuffer,
  }: RenderArgs) => {
    const colorAttachments: GPURenderPassColorAttachment[] = [
      {
        view: outputTextures.finalTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ];

    // const bindGroup = device.createBindGroup({
    //   layout: pipeline.getBindGroupLayout(0),
    //   entries: [],
    // });
    // for (let i = 0; i < renderableEntities.length; i++) {
    //   const transform = ecs.getComponents(renderableEntities[i]).get(Transform);
    //   const voxelObject = ecs
    //     .getComponents(renderableEntities[i])
    //     .get(VoxelObject);
    //
    //   const size = voxelObject.size;
    //   const m = mat4.scale(transform.transform, size);
    //   const vp = mat4.mul(
    //     mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
    //     getViewMatrix(cameraTransform),
    //   );
    //   const mvp = new Float32Array(mat4.mul(vp, m));
    //   const bufferOffset = i * MVP_BUFFER_STRIDE;
    //   device.queue.writeBuffer(
    //     modelViewProjectionMatrixBuffer,
    //     bufferOffset,
    //     mvp,
    //   );
    // }

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments,
      timestampWrites,
    });
    passEncoder.setPipeline(pipeline);
    // passEncoder.setVertexBuffer(0, verticesBuffer);
    // passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(6);
    passEncoder.end();
  };

  return { render, label: "simple lights" };
};
