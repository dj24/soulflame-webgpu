import { canvas, device, gpuContext } from "../app";

export const writeTextureToCanvas = async (
  device: GPUDevice,
  textureView: GPUTextureView,
  canvas: HTMLCanvasElement,
) => {
  const context = canvas.getContext("webgpu");
  context.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  canvas.style.imageRendering = "pixelated";
};
