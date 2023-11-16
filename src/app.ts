import shaderCode from "./fullscreentexturedquad.wgsl";
import { Vector2 } from "./vector2";
import { createUniformBuffer } from "./buffer-utils";
import { ComputePass, createComputePass } from "./compute-pass";

export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let resolution = new Vector2(0, 0);
const startTime = performance.now();
export let elapsedTime = startTime;

const renderLoop = (device: GPUDevice, computePasses: ComputePass[]) => {
  let bindGroup;
  let outputTexture;
  let animationFrameId: ReturnType<typeof requestAnimationFrame>;
  const canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  gpuContext = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  gpuContext.configure({
    device: device,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const shaderModule = device.createShaderModule({ code: shaderCode });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragment_main",
      targets: [{ format: presentationFormat }],
    },
  });
  const start = () => {
    const { clientWidth, clientHeight } = canvas.parentElement;
    resolution = new Vector2(clientWidth, clientHeight);
    canvas.width = resolution.x;
    canvas.height = resolution.y;

    computePasses.forEach((computePass) => {
      computePass.start();
    });

    animationFrameId = requestAnimationFrame(frame);
  };

  const fullscreenQuad = ({
    commandEncoder,
    outputTextureView,
  }: {
    commandEncoder: GPUCommandEncoder;
    outputTextureView: GPUTextureView;
  }) => {
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuContext.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: [0.3, 0.3, 0.3, 1],
          storeOp: "store",
        },
      ],
    });

    bindGroup = device.createBindGroup({
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
          resource: outputTextureView,
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();
  };

  const createOutputTextureView = () => {
    outputTexture = device.createTexture({
      size: [resolution.x, resolution.y, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return outputTexture.createView();
  };
  const frame = async () => {
    elapsedTime = performance.now() - startTime;

    const commandEncoder = device.createCommandEncoder();
    const timeBuffer = createUniformBuffer([elapsedTime]);
    const resolutionBuffer = createUniformBuffer([resolution.x, resolution.y]);
    const outputTextureView = createOutputTextureView();

    computePasses.forEach((computePass) => {
      computePass.render({
        commandEncoder,
        timeBuffer,
        resolutionBuffer,
        outputTextureView,
      });
    });

    fullscreenQuad({ commandEncoder, outputTextureView });

    device.queue.submit([commandEncoder.finish()]);
    animationFrameId = requestAnimationFrame(frame);
  };

  const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(animationFrameId);
    start();
  });
  resizeObserver.observe(canvas.parentElement);
};

if (navigator.gpu !== undefined) {
  navigator.gpu.requestAdapter().then((adapter) => {
    adapter.requestDevice().then((newDevice) => {
      device = newDevice;
      const computePass = createComputePass();
      renderLoop(device, [computePass]);
    });
  });
} else {
  console.error("WebGPU not supported");
}
