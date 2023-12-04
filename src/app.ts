import fullscreenQuadShader from "./shader/fullscreentexturedquad.wgsl";
import { createUniformBuffer, writeToUniformBuffer } from "./buffer-utils";
import { ComputePass, createComputePass } from "./compute-pass";
import { Camera, moveCamera } from "./camera";
import { DebugUI } from "./ui";
import { Vector3 } from "./vector3";
import "./main.css";
import { animate, spring } from "motion";
import {Vector2} from "./vector2";

export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = new Vector2(0, 0);
let downscale = 1;
export let scale = 1;
export let translateX = 0;
const startTime = performance.now();
export let elapsedTime = startTime;
export let deltaTime = 0;

const startingCameraPosition = new Vector3(120, 120, 120);
const startingCameraDirection = new Vector3(-1, -1, -1).normalize();
const startingCameraFieldOfView = 82.5;
export let camera = new Camera({
  fieldOfView: startingCameraFieldOfView,
  position: new Vector3(120,0,120),
  direction: new Vector3(-1,0,-1).normalize(),
});

const animateCameraToStartingPosition = () => {
  const targetPosition = startingCameraPosition;
  const startPosition = camera.position;
  const targetDirection = startingCameraDirection;
  const startDirection = camera.direction;
  const targetFieldOfView = startingCameraFieldOfView;
  const startFieldOfView = camera.fieldOfView;
  const startScale = scale;
  const startTranslateX = translateX;
  const targetScale = 1;
  const targetTranslateX = 0;
  animate(
      (progress: number) => {
        camera.position = startPosition.add(targetPosition.subtract(startPosition).mul(progress));
        camera.direction = startDirection.add(targetDirection.subtract(startDirection).mul(progress));
        camera.fieldOfView = startFieldOfView + (targetFieldOfView - startFieldOfView) * progress;
        scale = startScale + (targetScale - startScale) * progress;
        translateX = startTranslateX + (targetTranslateX - startTranslateX) * progress;
      },
      {
        easing: spring({
          restDistance: 0.0001,
          damping: 40,
          stiffness: 700,
          mass: 2,
        }),
      },
  );
}

animateCameraToStartingPosition();

window.addEventListener("resetcamera", animateCameraToStartingPosition);


const debugUI = new DebugUI();

let handleDownscaleChange: (event: CustomEvent) => void;

let handleFovChange = (event: CustomEvent) => {
  camera.fieldOfView = parseFloat(event.detail);
};
window.addEventListener("changefov", handleFovChange);


const handleTranslateChange = (event: CustomEvent) => {
  translateX = parseFloat(event.detail);
};

window.addEventListener("changetranslate", handleTranslateChange);

const handleScaleChange = (event: CustomEvent) => {
  scale = parseFloat(event.detail);
};
window.addEventListener("changescale", handleScaleChange);

const renderLoop = (device: GPUDevice, computePasses: ComputePass[]) => {
  let bindGroup;
  let outputTexture: GPUTexture;
  let animationFrameId: ReturnType<typeof requestAnimationFrame>;
  let timeBuffer: GPUBuffer;
  let resolutionBuffer: GPUBuffer;
  let downscaledResolution: Vector2;

  canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;

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

  const reset = () => {
    cancelAnimationFrame(animationFrameId);
    start();
  };
  const start = () => {
    const { clientWidth, clientHeight } = canvas.parentElement;
    resolution = new Vector2(
      clientWidth * window.devicePixelRatio,
      clientHeight * window.devicePixelRatio,
    );
    downscaledResolution = resolution.mul(1 / downscale);
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
      size: [downscaledResolution.x, downscaledResolution.y, 1],
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

    moveCamera();
    camera.update();
    debugUI.log(`Position: ${camera.position.toString()}
    Resolution: ${downscaledResolution.x.toFixed(
      0,
    )}x${downscaledResolution.y.toFixed(0)}
    FPS: ${(1000 / deltaTime).toFixed(1)}
    `);

    const commandEncoder = device.createCommandEncoder();
    if (timeBuffer) {
      writeToUniformBuffer(timeBuffer, [elapsedTime]);
    } else {
      timeBuffer = createUniformBuffer([elapsedTime]);
    }
    if (resolutionBuffer) {
      writeToUniformBuffer(resolutionBuffer, [
        downscaledResolution.x,
        downscaledResolution.y,
      ]);
    } else {
      resolutionBuffer = createUniformBuffer([
        downscaledResolution.x,
        downscaledResolution.y,
      ]);
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

  const resizeObserver = new ResizeObserver(reset);
  handleDownscaleChange = (event) => {
    downscale = event.detail;
    reset();
  };
  window.addEventListener("changedownscale", handleDownscaleChange);
  resizeObserver.observe(canvas.parentElement);
};

if (navigator.gpu !== undefined) {
  navigator.gpu.requestAdapter().then((adapter) => {
    adapter.requestDevice().then((newDevice) => {
      device = newDevice;
      console.log(device.limits);
      const computePass = createComputePass();
      renderLoop(device, [computePass]);
    });
  });
} else {
  console.error("WebGPU not supported");
}
