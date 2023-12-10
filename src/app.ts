import { createUniformBuffer, writeToUniformBuffer } from "./buffer-utils";
import { RenderPass, getGBufferPass } from "./g-buffer/get-g-buffer-pass";
import { Camera, moveCamera } from "./camera";
import { DebugUI } from "./ui";
import "./main.css";
import { Vec2, vec2, vec3 } from "wgpu-matrix";
import treeModel from "./voxel-models/fir-tree.vxm";
import miniViking from "./voxel-models/mini-viking.vxm";
import { fullscreenQuad } from "./fullscreen-quad/fullscreen-quad";
import { getDepthPrepass } from "./depth-prepass/get-depth-prepass";

export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = vec2.zero();
let downscale = 1;
export let scale = 1;
export const maxObjectCount = 768;
export let objectCount = 512;
export let translateX = 0;
const startTime = performance.now();
export let elapsedTime = startTime;
export let deltaTime = 0;

const startingCameraFieldOfView = 82.5;
export let camera = new Camera({
  fieldOfView: startingCameraFieldOfView,
  position: vec3.create(80, 480, 80),
  direction: vec3.normalize(vec3.create(-1, -1, -1)),
});

const debugUI = new DebugUI();

let handleDownscaleChange: (event: CustomEvent) => void;

const renderLoop = (device: GPUDevice, computePasses: RenderPass[]) => {
  let normalTexture: GPUTexture;
  let albedoTexture: GPUTexture;
  let outputTexture: GPUTexture;
  let depthTexture: GPUTexture;
  let animationFrameId: ReturnType<typeof requestAnimationFrame>;
  let fixedIntervalId: ReturnType<typeof setInterval>;
  let timeBuffer: GPUBuffer;
  let resolutionBuffer: GPUBuffer;

  canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  gpuContext = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  gpuContext.configure({
    device: device,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const reset = () => {
    clearInterval(fixedIntervalId);
    cancelAnimationFrame(animationFrameId);
    init();
  };

  const init = () => {
    const { clientWidth, clientHeight } = canvas.parentElement;
    let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    const canvasResolution = vec2.create(
      clientWidth * pixelRatio,
      clientHeight * pixelRatio,
    );
    resolution = vec2.mulScalar(canvasResolution, 1 / downscale);
    canvas.width = canvasResolution[0];
    canvas.height = canvasResolution[1];
    canvas.style.transform = `scale(${1 / pixelRatio})`;
    animationFrameId = requestAnimationFrame(frame);
    fixedIntervalId = setInterval(fixedUpdate, 1000 / 60);
  };

  const createOutputTextureView = () => {
    if (outputTexture) {
      outputTexture.destroy();
    }
    outputTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return outputTexture.createView();
  };

  const createNormalTextureView = () => {
    if (normalTexture) {
      normalTexture.destroy();
    }
    normalTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return normalTexture.createView();
  };

  const createDepthTextureView = () => {
    if (depthTexture) {
      depthTexture.destroy();
    }
    depthTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "r32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return depthTexture.createView();
  };

  const createAlbedoTextureView = () => {
    if (albedoTexture) {
      albedoTexture.destroy();
    }
    albedoTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return albedoTexture.createView();
  };

  const fixedUpdate = () => {
    computePasses.forEach(({ fixedUpdate }) => {
      if (fixedUpdate) {
        fixedUpdate();
      }
    });
  };

  const frame = async () => {
    const newElapsedTime = performance.now() - startTime;
    deltaTime = newElapsedTime - elapsedTime;
    elapsedTime = newElapsedTime;
    moveCamera();
    camera.update();
    debugUI.log(`Position: ${camera.position[0].toFixed(
      0,
    )}, ${camera.position[1].toFixed(0)}, ${camera.position[2].toFixed(0)}
    Resolution: ${resolution[0].toFixed(0)}x${resolution[1].toFixed(0)}
    FPS: ${(1000 / deltaTime).toFixed(1)}
    Object Count: ${objectCount}
    `);

    const commandEncoder = device.createCommandEncoder();
    if (timeBuffer) {
      writeToUniformBuffer(timeBuffer, [elapsedTime]);
    } else {
      timeBuffer = createUniformBuffer([elapsedTime]);
    }
    if (resolutionBuffer) {
      writeToUniformBuffer(resolutionBuffer, [resolution[0], resolution[1]]);
    } else {
      resolutionBuffer = createUniformBuffer([resolution[0], resolution[1]]);
    }

    const outputTextureView = createOutputTextureView();
    const normalTextureView = createNormalTextureView();
    const albedoTextureView = createAlbedoTextureView();
    const depthTextureView = createDepthTextureView();
    computePasses.forEach(({ render }) => {
      render({
        commandEncoder,
        resolutionBuffer,
        outputTextureViews: [
          outputTextureView,
          albedoTextureView,
          normalTextureView,
          depthTextureView,
        ],
      });
    });
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
    adapter.requestDevice().then(async (newDevice) => {
      device = newDevice;
      console.log(device.limits);
      console.log({ treeModel, miniViking });
      renderLoop(device, [
        // await getDepthPrepass(),
        await getGBufferPass(),
        fullscreenQuad(device),
      ]);
    });
  });
} else {
  console.error("WebGPU not supported");
}
