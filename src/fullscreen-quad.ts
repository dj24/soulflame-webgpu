import { gpuContext } from "./app";
import fullscreenQuadShader from "./shader/fullscreentexturedquad.wgsl";
import { RenderArgs } from "./get-g-buffer-pass";

export const fullscreenQuad = (device: GPUDevice) => {
  const fullscreenQuadShaderModule = device.createShaderModule({
    code: fullscreenQuadShader,
  });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: fullscreenQuadShaderModule,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: fullscreenQuadShaderModule,
      entryPoint: "fragment_main",
      targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
    },
  });
  const render = (args: RenderArgs) => {
    const renderPass = args.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuContext.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: [0.3, 0.3, 0.3, 1],
          storeOp: "store",
        },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
        {
          binding: 1,
          resource: args.outputTextureViews[0],
        },
        {
          binding: 2,
          resource: args.outputTextureViews[1],
        },
        {
          binding: 3,
          resource: args.outputTextureViews[2],
        },
        {
          binding: 4,
          resource: args.outputTextureViews[3],
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();
  };

  return { render };
};
