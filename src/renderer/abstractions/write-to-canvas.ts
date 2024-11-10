import { OUTPUT_TEXTURE_FORMAT } from "../constants";

export const writeTextureToCanvas = async (
  device: GPUDevice,
  textureView: GPUTextureView,
  canvas: HTMLCanvasElement,
) => {
  const context = canvas.getContext("webgpu");
  context.configure({
    device,
    format: OUTPUT_TEXTURE_FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  canvas.style.imageRendering = "pixelated";
};
