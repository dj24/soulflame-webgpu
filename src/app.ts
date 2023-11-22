import fullscreenQuadShader from "./shader/fullscreentexturedquad.wgsl";
import { Vector2 } from "./vector2";
import { createUniformBuffer, writeToUniformBuffer } from "./buffer-utils";
import { ComputePass, createComputePass } from "./compute-pass";
import { Camera, moveCamera } from "./camera";
import { DebugUI } from "./ui";
import { Vector3 } from "./vector3";
import "./main.css";
import testModel from "./test.vxm";
export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = new Vector2(0, 0);
const startTime = performance.now();
export let elapsedTime = startTime;
export let deltaTime = 0;
export let camera = new Camera({
  fieldOfView: 90,
  position: new Vector3(16, 16, -16),
});

const debugUI = new DebugUI();

console.log({ testModel });

const renderLoop = (device: GPUDevice, computePasses: ComputePass[]) => {
  let bindGroup;
  let outputTexture: GPUTexture;
  let animationFrameId: ReturnType<typeof requestAnimationFrame>;
  let timeBuffer: GPUBuffer;
  let resolutionBuffer: GPUBuffer;
  let isCursorLocked: boolean;

  canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  canvas.addEventListener("click", async () => {
    canvas.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", () => {
    isCursorLocked = document.pointerLockElement !== null;
  });
  gpuContext = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  gpuContext.configure({
    device: device,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
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
      targets: [{ format: presentationFormat }],
    },
  });
  const start = () => {
    const { clientWidth, clientHeight } = canvas.parentElement;
    resolution = new Vector2(
      clientWidth * window.devicePixelRatio,
      clientHeight * window.devicePixelRatio,
    );
    canvas.width = resolution.x;
    canvas.height = resolution.y;
    canvas.style.transform = `scale(${1 / window.devicePixelRatio})`;

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
    if (outputTexture) {
      outputTexture.destroy();
    }
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
    const newElapsedTime = performance.now() - startTime;
    deltaTime = newElapsedTime - elapsedTime;
    elapsedTime = newElapsedTime;

    if (isCursorLocked) {
      moveCamera();
    }
    camera.update();
    debugUI.log(`Position: ${camera.position.toString()}
    Resolution: ${resolution.x}x${resolution.y}
    FPS: ${(1000 / deltaTime).toFixed(1)}
    `);

    const commandEncoder = device.createCommandEncoder();
    if (timeBuffer) {
      writeToUniformBuffer(timeBuffer, [elapsedTime]);
    } else {
      timeBuffer = createUniformBuffer([elapsedTime]);
    }
    if (resolutionBuffer) {
      writeToUniformBuffer(resolutionBuffer, [resolution.x, resolution.y]);
    } else {
      resolutionBuffer = createUniformBuffer([resolution.x, resolution.y]);
    }

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
