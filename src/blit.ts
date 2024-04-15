// Blits a texture to another texture with bilinear filtering.
import fullscreenQuadShader from "./fullscreen-quad/fullscreentexturedquad.wgsl";

export const blit = (device: GPUDevice) => {
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
      targets: [{ format: "rgba8unorm" }],
    },
  });
  const render = (
    commandEncoder: GPUCommandEncoder,
    source: GPUTexture,
    destination: GPUTexture,
  ) => {
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: destination.createView(),
          loadOp: "clear",
          clearValue: [0.3, 0.3, 0.3, 0.3],
          storeOp: "store",
        },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 1,
          resource: source.createView(),
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(0);
    renderPass.end();
  };
  return render;
};
