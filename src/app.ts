import {
  createFloatUniformBuffer,
  createUniformBuffer,
  writeToFloatUniformBuffer,
  writeToUniformBuffer,
} from "./buffer-utils";
import {
  getGBufferPass,
  OutputTextureViews,
} from "./g-buffer/get-g-buffer-pass";
import { Camera, moveCamera } from "./camera";
import { DebugUI } from "./ui";
import "./main.css";
import { Mat4, mat4, vec2, vec3 } from "wgpu-matrix";
import cornellBox from "./voxel-models/cornell.vxm";
import teapot from "./voxel-models/teapot.vxm";
import { fullscreenQuad } from "./fullscreen-quad/fullscreen-quad";
import { getDepthPrepass } from "./depth-prepass/get-depth-prepass";
import { DebugValuesStore } from "./debug-values-store";
import { createTextureFromImage, createTextureFromImages } from "webgpu-utils";
import { getReflectionsPass } from "./reflections-pass/get-reflections-pass";
import { getWorldSpaceFrustumCornerDirections } from "./get-frustum-corner-directions";
import { create3dTexture } from "./create-3d-texture";
import { getDiffusePass } from "./diffuse-pass/get-diffuse-pass";
import { getVolumeAtlas, VolumeAtlas } from "./volume-atlas";
import { haltonJitter } from "./jitter-view-projection";

export type RenderArgs = {
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextureViews: OutputTextureViews;
  frustumCornerDirectionsBuffer: GPUBuffer;
  cameraPositionBuffer: GPUBuffer;
  voxelTextureView: GPUTextureView;
  transformationMatrixBuffer: GPUBuffer;
  timeBuffer: GPUBuffer;
};

export type RenderPass = {
  fixedUpdate?: () => void;
  render: (args: RenderArgs) => void;
};

export const debugValues = new DebugValuesStore();

export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = vec2.zero();
let downscale = 4.0;
const startTime = performance.now();
export let elapsedTime = startTime;
export let deltaTime = 0;
export let frameCount = 0;

let volumeAtlas: VolumeAtlas;

const startingCameraFieldOfView = 80;
export let camera = new Camera({
  fieldOfView: startingCameraFieldOfView,
  position: vec3.create(3.5, 3.5, -6.8),
  direction: vec3.normalize(vec3.create(0, 0, 1)),
});

const debugUI = new DebugUI();

let handleDownscaleChange: (event: CustomEvent) => void;

let skyTextureView: GPUTextureView;
let voxelTextureView: GPUTextureView;

export const getObjectTransformsWorker = new Worker(
  new URL("./get-objects-transforms/objects-worker.ts", import.meta.url),
);

const renderLoop = (device: GPUDevice, computePasses: RenderPass[]) => {
  let normalTexture: GPUTexture;
  let albedoTexture: GPUTexture;
  let outputTexture: GPUTexture;
  let depthTexture: GPUTexture;
  let debugTexture: GPUTexture;

  let animationFrameId: ReturnType<typeof requestAnimationFrame>;
  let fixedIntervalId: ReturnType<typeof setInterval>;
  let timeBuffer: GPUBuffer;
  let resolutionBuffer: GPUBuffer;
  let transformationMatrixBuffer: GPUBuffer;
  let previousViewProjectionMatrix: Mat4;

  // TODO: fix this
  getObjectTransformsWorker.addEventListener(
    "message",
    (event: MessageEvent<number[]>) => {
      if (transformationMatrixBuffer) {
        writeToFloatUniformBuffer(transformationMatrixBuffer, event.data);
      } else {
        transformationMatrixBuffer = createFloatUniformBuffer(
          device,
          event.data,
          "voxel object",
        );
      }
    },
  );

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
      return outputTexture.createView();
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
      return normalTexture.createView();
    }
    normalTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8snorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
    return normalTexture.createView();
  };

  const createDepthTextureView = () => {
    if (depthTexture) {
      return depthTexture.createView();
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
      return albedoTexture.createView();
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

  const createDebugTexture = () => {
    if (debugTexture) {
      return debugTexture.createView();
    }
    debugTexture = device.createTexture({
      size: [resolution[0], resolution[1], 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return debugTexture.createView();
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
    frameCount++;

    getObjectTransformsWorker.postMessage({
      maxObjectCount: debugValues.maxObjectCount,
      objectCount: debugValues.objectCount,
      scale: debugValues.scale,
      translateX: debugValues.translateX,
      rotateY: debugValues.rotateY,
      camera,
      objectSize: [50, 50, 50],
    });

    //TODO: handle loading this more gracefully
    if (!transformationMatrixBuffer) {
      animationFrameId = requestAnimationFrame(frame);
      return;
    }

    moveCamera();
    camera.update();
    debugValues.update();

    const jitteredCameraPosition = mat4.getTranslation(camera.viewMatrix);

    debugUI.log(
      `
      Direction: ${camera.direction[0].toFixed(
        1,
      )}, ${camera.direction[1].toFixed(1)}, ${camera.direction[2].toFixed(1)}
      Position: ${jitteredCameraPosition[0].toFixed(
        1,
      )}, ${jitteredCameraPosition[1].toFixed(
        1,
      )}, ${jitteredCameraPosition[2].toFixed(1)}
    Resolution: ${resolution[0].toFixed(1)}x${resolution[1].toFixed(0)}
    Frame Time: ${deltaTime.toFixed(1)}ms
    Object Count: ${debugValues.objectCount}
    `,
    );

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
    const debugTextureView = createDebugTexture();

    // 4 byte stride
    const flatMappedDirections = getWorldSpaceFrustumCornerDirections(
      camera,
    ).flatMap((direction) => [...direction, 0]);

    // TODO: make sure to destroy these buffers or write to them instead
    const frustumCornerDirectionsBuffer = createFloatUniformBuffer(
      device,
      flatMappedDirections,
      "frustum corner directions",
    );

    const cameraPositionBuffer = createFloatUniformBuffer(
      device,
      jitteredCameraPosition as number[],
      "camera position",
    );
    voxelTextureView = volumeAtlas.getAtlasTextureView();
    computePasses.forEach(({ render }) => {
      render({
        commandEncoder,
        resolutionBuffer,
        timeBuffer,
        outputTextureViews: {
          finalTexture: outputTextureView,
          albedoTextureView,
          normalTextureView,
          depthAndClusterTextureView: depthTextureView,
          debugTextureView,
          skyTextureView,
        },
        frustumCornerDirectionsBuffer,
        cameraPositionBuffer,
        voxelTextureView,
        transformationMatrixBuffer,
      });
    });
    device.queue.submit([commandEncoder.finish()]);
    animationFrameId = requestAnimationFrame(frame);
    previousViewProjectionMatrix = camera.viewProjectionMatrix;
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
      const skyTexture = await createTextureFromImages(device, [
        "cubemaps/town-square/posx.jpg",
        "cubemaps/town-square/negx.jpg",
        "cubemaps/town-square/posy.jpg",
        "cubemaps/town-square/negy.jpg",
        "cubemaps/town-square/posz.jpg",
        "cubemaps/town-square/negz.jpg",
      ]);
      skyTextureView = skyTexture.createView({
        dimension: "cube",
      });
      volumeAtlas = getVolumeAtlas(device);
      const cornellBoxTexture = await create3dTexture(
        device,
        cornellBox.sliceFilePaths,
        cornellBox.size,
        "cornell box",
      );
      volumeAtlas.addVolume(cornellBoxTexture, "cornell box");
      cornellBoxTexture.destroy();

      setTimeout(() => {
        create3dTexture(
          device,
          teapot.sliceFilePaths,
          teapot.size,
          "cube",
        ).then((teapotTexture) => {
          volumeAtlas.addVolume(teapotTexture, "teapot");
          console.log({ teapot, teapotTexture });
          teapotTexture.destroy();
        });
      }, 1000);

      setTimeout(() => {
        // volumeAtlas.removeVolume("teapot");
      }, 2000);

      renderLoop(device, [
        // TODO: use center of pixel instead for depth prepass
        // await getDepthPrepass(),
        await getGBufferPass(),
        // await getDiffusePass(),
        // await getReflectionsPass(),
        fullscreenQuad(device),
      ]);
    });
  });
} else {
  console.error("WebGPU not supported");
}
