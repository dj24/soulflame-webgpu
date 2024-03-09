import { camera, device, RenderArgs, RenderPass } from "../app";
import redFrag from "./red.frag.wgsl";
import triangleVert from "./triangle.vert.wgsl";
import { mat4, vec3 } from "wgpu-matrix";

export const getHelloTrianglePass = async (): Promise<RenderPass> => {
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({
        code: triangleVert,
      }),
      entryPoint: "main",
    },
    fragment: {
      module: device.createShaderModule({
        code: redFrag,
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
    },
  });

  let modelViewProjectionMatrixBuffer: GPUBuffer;

  const render = ({
    commandEncoder,
    outputTextures,
    cameraPositionBuffer,
    voxelTextureView,
    transformationMatrixBuffer,
    viewProjectionMatricesBuffer,
    timestampWrites,
    sunDirectionBuffer,
    bvhBuffer,
  }: RenderArgs) => {
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: outputTextures.finalTexture.createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "load",
          storeOp: "store",
        },
      ],
      timestampWrites,
    };

    const eye = camera.position;
    const viewMatrix = mat4.lookAt(
      eye,
      vec3.add(eye, camera.direction),
      camera.up,
    );

    const viewProjectionMatrix = mat4.mul(camera.projectionMatrix, viewMatrix);

    const modelViewProjectionMatrix = mat4.mul(
      mat4.identity(),
      viewProjectionMatrix,
    );

    if (!modelViewProjectionMatrixBuffer) {
      modelViewProjectionMatrixBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(
      modelViewProjectionMatrixBuffer,
      0,
      new Float32Array(viewProjectionMatrix),
    );

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: modelViewProjectionMatrixBuffer,
          },
        },
      ],
    });

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setPipeline(pipeline);
    passEncoder.draw(3);
    passEncoder.end();

    return [commandEncoder.finish()];
  };

  return { render, label: "hello triangle" };
};
