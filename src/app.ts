import {
  createFloatUniformBuffer,
  createUniformBuffer,
  writeToFloatUniformBuffer,
  writeToUniformBuffer,
} from "./buffer-utils";
import { getGBufferPass, OutputTextures } from "./g-buffer/get-g-buffer-pass";
import { Camera, moveCamera } from "./camera";
import { DebugUI } from "./ui";
import "./main.css";
import { Mat4, mat4, vec2, vec3 } from "wgpu-matrix";
import cornellBox from "./voxel-models/cornell.vxm";
import dragon from "./voxel-models/dragon.vxm";
import treeHouse from "./voxel-models/treehouse.vxm";
import { fullscreenQuad } from "./fullscreen-quad/fullscreen-quad";
import { getDepthPrepass } from "./depth-prepass/get-depth-prepass";
import { DebugValuesStore } from "./debug-values-store";
import {
  createTextureFromImage,
  createTextureFromImages,
  generateMipmap,
} from "webgpu-utils";
import { getReflectionsPass } from "./reflections-pass/get-reflections-pass";
import { getWorldSpaceFrustumCornerDirections } from "./get-frustum-corner-directions";
import { create3dTexture } from "./create-3d-texture/create-3d-texture";
import { getDiffusePass } from "./diffuse-pass/get-diffuse-pass";
import { getVolumeAtlas, VolumeAtlas } from "./volume-atlas";
import { haltonJitter } from "./jitter-view-projection";
import { getTaaPass } from "./taa-pass/get-taa-pass";
import { getFrameTimeTracker } from "./frametime-tracker";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";

export type RenderArgs = {
  enabled?: boolean;
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextures: OutputTextures;
  frustumCornerDirectionsBuffer: GPUBuffer;
  cameraPositionBuffer: GPUBuffer;
  voxelTextureView: GPUTextureView;
  transformationMatrixBuffer: GPUBuffer;
  timeBuffer: GPUBuffer;
  viewProjectionMatricesBuffer?: GPUBuffer;
};

export type RenderPass = {
  render: (args: RenderArgs) => GPUCommandBuffer;
  label?: string;
};

export const debugValues = new DebugValuesStore();

export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = vec2.create(4, 4);
let downscale = 1.0;
const startTime = performance.now();
export let elapsedTime = startTime;
export let deltaTime = 0;
export let frameCount = 0;

let volumeAtlas: VolumeAtlas;

const startingCameraFieldOfView = 80 * (Math.PI / 180);
export let camera = new Camera({
  fieldOfView: startingCameraFieldOfView,
  position: vec3.create(3.5, 3.5, -6.2),
  direction: vec3.create(),
});

const debugUI = new DebugUI();

const frameTimeTracker = getFrameTimeTracker();

let handleDownscaleChange: (event: CustomEvent) => void;

let voxelTextureView: GPUTextureView;
let octreeBuffer: GPUBuffer;
let skyTexture: GPUTexture;
export const getObjectTransformsWorker = new Worker(
  new URL("./get-objects-transforms/objects-worker.ts", import.meta.url),
);

let animationFrameId: ReturnType<typeof requestAnimationFrame>;

const renderLoop = (device: GPUDevice, computePasses: RenderPass[]) => {
  let normalTexture: GPUTexture;
  let albedoTexture: GPUTexture;
  let outputTexture: GPUTexture;
  let depthTexture: GPUTexture;
  let debugTexture: GPUTexture;
  let velocityTexture: GPUTexture;

  let timeBuffer: GPUBuffer;
  let resolutionBuffer: GPUBuffer;
  let transformationMatrixBuffer: GPUBuffer;
  let viewProjectionMatricesBuffer: GPUBuffer;

  let previousViewProjectionMatrix = mat4.create();

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

  const init = () => {
    const { clientWidth, clientHeight } = canvas.parentElement;
    let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    const canvasResolution = vec2.create(
      clientWidth * pixelRatio,
      clientHeight * pixelRatio,
    );
    resolution = vec2.mulScalar(canvasResolution, 1 / downscale);
    // Rounded to nearest multiple of 4 for buffer
    resolution = vec2.mulScalar(vec2.ceil(vec2.divScalar(resolution, 4)), 4);
    canvas.width = canvasResolution[0];
    canvas.height = canvasResolution[1];
    canvas.style.transform = `scale(${1 / pixelRatio})`;
    animationFrameId = requestAnimationFrame(frame);
  };

  const createOutputTexture = () => {
    if (!outputTexture) {
      outputTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.STORAGE_BINDING,
      });
    }
    return outputTexture;
  };

  const createNormalTexture = () => {
    if (!normalTexture) {
      normalTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba8snorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      });
    }
    return normalTexture;
  };

  const createDepthTexture = () => {
    if (!depthTexture) {
      depthTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "r32float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.STORAGE_BINDING,
      });
    }
    return depthTexture;
  };

  const createAlbedoTexture = () => {
    if (!albedoTexture) {
      albedoTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC,
      });
    }
    return albedoTexture;
  };

  const createDebugTexture = () => {
    if (!debugTexture) {
      debugTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.STORAGE_BINDING,
      });
    }
    return debugTexture;
  };

  const createVelocityTexture = () => {
    if (!velocityTexture) {
      velocityTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "r32float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      });
    }
    return velocityTexture;
  };

  const frame = async () => {
    const newElapsedTime = performance.now() - startTime;
    deltaTime = newElapsedTime - elapsedTime;
    frameTimeTracker.addSample("Frame Time", deltaTime);
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

    const bufferContents = [
      ...camera.viewProjectionMatrix,
      ...previousViewProjectionMatrix,
      ...camera.inverseViewProjectionMatrix,
      ...camera.projectionMatrix,
      ...camera.inverseProjectionMatrix,
    ];

    if (viewProjectionMatricesBuffer) {
      writeToFloatUniformBuffer(viewProjectionMatricesBuffer, bufferContents);
    } else {
      viewProjectionMatricesBuffer = createFloatUniformBuffer(
        device,
        bufferContents,
      );
    }

    //TODO: handle loading this more gracefully
    if (!transformationMatrixBuffer) {
      animationFrameId = requestAnimationFrame(frame);
      return;
    }

    moveCamera();
    camera.update();
    debugValues.update();

    const jitteredCameraPosition = mat4.getTranslation(camera.viewMatrix);

    debugUI.log(`${resolution[0]} x ${resolution[1]}`);

    if (timeBuffer) {
      writeToUniformBuffer(timeBuffer, [frameCount]);
    } else {
      timeBuffer = createUniformBuffer([frameCount]);
    }

    if (resolutionBuffer) {
      writeToUniformBuffer(resolutionBuffer, [resolution[0], resolution[1]]);
    } else {
      resolutionBuffer = createUniformBuffer([resolution[0], resolution[1]]);
    }

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

    createAlbedoTexture();
    createNormalTexture();
    createDepthTexture();
    createDebugTexture();
    createVelocityTexture();
    createOutputTexture();

    let commandBuffers = [];

    // Clear Albedo every frame

    const commandEncoder = device.createCommandEncoder();

    // Create a render pass and encode it into the command encoder
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: albedoTexture.createView(),
          loadOp: "clear",
          clearValue: [0.3, 0.3, 0.3, 1],
          storeOp: "store", // 'clear' if you want to clear, 'store' if you want to preserve existing contents
        },
      ],
    });
    renderPass.end();
    commandBuffers.push(commandEncoder.finish());

    voxelTextureView = volumeAtlas.getAtlasTextureView();

    for (const computePass of computePasses) {
      const { render, label } = computePass;
      const commandBuffer = render({
        commandEncoder: device.createCommandEncoder(),
        resolutionBuffer,
        timeBuffer,
        outputTextures: {
          finalTexture: outputTexture,
          albedoTexture,
          normalTexture,
          depthAndClusterTexture: depthTexture,
          debugTexture,
          skyTexture,
          velocityTexture,
        },
        frustumCornerDirectionsBuffer,
        cameraPositionBuffer,
        voxelTextureView,
        transformationMatrixBuffer,
        viewProjectionMatricesBuffer,
      });
      commandBuffers.push(commandBuffer);
    }

    device.queue.submit(commandBuffers);
    // await device.queue.onSubmittedWorkDone();
    animationFrameId = requestAnimationFrame(frame);
    previousViewProjectionMatrix = camera.inverseViewProjectionMatrix;
    // previousViewProjectionMatrix = camera.viewProjectionMatrix;
  };

  init();
};

const start = async () => {
  cancelAnimationFrame(animationFrameId);
  if (navigator.gpu !== undefined) {
    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice();
    console.log(device.limits);
    skyTexture = await createTextureFromImages(device, [
      "cubemaps/town-square/posx.jpg",
      "cubemaps/town-square/negx.jpg",
      "cubemaps/town-square/posy.jpg",
      "cubemaps/town-square/negy.jpg",
      "cubemaps/town-square/posz.jpg",
      "cubemaps/town-square/negz.jpg",
    ]);
    volumeAtlas = getVolumeAtlas(device);
    // const cornellBoxTexture = await create3dTexture(
    //   device,
    //   cornellBox.sliceFilePaths,
    //   cornellBox.size,
    //   "cornell box",
    // );
    // volumeAtlas.addVolume(cornellBoxTexture, "cornell box");
    // cornellBoxTexture.destroy();

    const treeHouseTexture = await create3dTexture(
      device,
      treeHouse.sliceFilePaths,
      treeHouse.size,
      "treeHouse",
    );
    generateOctreeMips(device, treeHouseTexture);
    // voxelTextureView = treeHouseTexture.createView();
    volumeAtlas.addVolume(treeHouseTexture, "treeHouse");
    treeHouseTexture.destroy();

    renderLoop(device, [
      // await getDepthPrepass(),
      await getGBufferPass(),
      // await getDiffusePass(),
      // await getReflectionsPass(),
      // await getTaaPass(),
      fullscreenQuad(device),
    ]);
  } else {
    console.error("WebGPU not supported");
  }
};

let startPromise = start();
// window.onresize = async () => {
//   await startPromise;
//   start();
// };

// const resizeObserver = new ResizeObserver(start);
// resizeObserver.observe(canvas.parentElement);
