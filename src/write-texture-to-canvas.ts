import fullscreenQuadShader from "./fullscreen-quad/fullscreentexturedquad.wgsl";
import { VOLUME_ATLAS_FORMAT } from "./constants";

export const writeTextureToCanvas = async (
  device: GPUDevice,
  canvasId: string,
  texture: GPUTexture,
) => {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  canvas.style.imageRendering = "pixelated";
  canvas.width = texture.width;
  canvas.height = texture.height;
  const gpuContext = canvas.getContext("webgpu");
  gpuContext.configure({
    device,
    format: VOLUME_ATLAS_FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const commandEncoder = device.createCommandEncoder();
  const fullscreenQuadShaderModule = device.createShaderModule({
    code: fullscreenQuadShader,
  });
  const renderPipeline = device.createRenderPipeline({
    label: "write texture to canvas",
    layout: "auto",
    vertex: {
      module: fullscreenQuadShaderModule,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: fullscreenQuadShaderModule,
      entryPoint: "fragment_main",
      targets: [{ format: VOLUME_ATLAS_FORMAT }],
    },
  });
  const renderPass = commandEncoder.beginRenderPass({
    label: "write texture to canvas",
    colorAttachments: [
      {
        view: gpuContext.getCurrentTexture().createView(),
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
        resource: texture.createView({
          label: "texture being written to canvas",
        }),
      },
    ],
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, bindGroup);
  renderPass.draw(6);
  renderPass.end();
  device.queue.submit([commandEncoder.finish()]);
};
