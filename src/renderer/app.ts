import {
  createFloatUniformBuffer,
  createUniformBuffer,
  writeToFloatUniformBuffer,
  writeToUniformBuffer,
} from "./buffer-utils";
import { getGBufferPass, OutputTextures } from "./g-buffer/get-g-buffer-pass";
import { Camera } from "./components/camera";
import { DebugUI } from "./ui";
import "./main.css";
import { Mat4, mat4, quat, vec2, vec3 } from "wgpu-matrix";
import { fullscreenQuad } from "./fullscreen-quad/fullscreen-quad";
import { DebugValuesStore } from "./debug-values-store";
import { createTextureFromImage } from "webgpu-utils";
import { VolumeAtlas } from "./volume-atlas";
import { getFrameTimeTracker } from "./frametime-tracker";
import { BVH } from "./bvh";
import { getLightsPass } from "./lights-pass/get-lights-pass";
import {
  AlbedoTexture,
  DepthTexture,
  GBufferTexture,
  NormalTexture,
  OutputTexture,
  VelocityTexture,
  WorldPositionTexture,
} from "./abstractions/g-buffer-texture";
import { getClearPass } from "./clear-pass/get-clear-pass";
import { getBoxOutlinePass } from "./box-outline/get-box-outline-pass";
import { generateJitter, jitterProjectionMatrix } from "./halton-sequence";
import { resolveTimestampQueries } from "./abstractions/resolve-timestamp-queries";
import { createSkyTexture } from "./abstractions/create-sky-texture";

import { Transform } from "@renderer/components/transform";
import {
  getVoxelObjectBoundingBox,
  VoxelObject,
  voxelObjectToDataView,
} from "@renderer/voxel-object";
import { ECS, Entity } from "@ecs/ecs";
import { getShadowsPass } from "@renderer/shadow-pass/get-shadows-pass";
import { getTaaPass } from "@renderer/taa-pass/get-taa-pass";
import { getVignettePass } from "@renderer/get-vignette-pass/get-vignette-pass";
import { getMotionBlurPass } from "@renderer/motion-blur/motion-blur";
import { getFogPass } from "@renderer/fog-pass/get-fog-pass";
import { getSkyPass } from "@renderer/sky-and-fog/get-sky-pass";
import { getTonemapPass } from "@renderer/tonemap-pass/get-tonemap-pass";
import { getLutPass } from "@renderer/get-lut-pass/get-lut-pass";
import { getSimpleFogPass } from "@renderer/simple-fog-pass/get-simple-fog-pass";
import { getGlobalIlluminationPass } from "@renderer/get-global-illumination/get-global-illumination-pass";
import { copyGBufferTexture } from "@renderer/abstractions/copy-g-buffer-texture";
import { getBloomPass } from "@renderer/bloom-pass/get-bloom-pass";
import { getRasterTracePass } from "@renderer/raster-trace/get-raster-trace-pass";
import { getLightDebugPass } from "@renderer/box-outline/get-light-debug-pass";
import { OUTPUT_TEXTURE_FORMAT } from "@renderer/constants";
import { getSmoothNormalsPass } from "@renderer/smooth-normals-pass/smooth-normals-pass";

export const debugValues = new DebugValuesStore();
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = vec2.create(4, 4);
let startTime = 0;
export let elapsedTime = startTime;
export let deltaTime = 0;
export let frameCount = 0;
let volumeAtlas: VolumeAtlas;
export let device: GPUDevice;

const debugUI = new DebugUI();
(window as any).debugUI = debugUI;

let timeDebug = {
  isPaused: false,
};

(window as any).debugUI.gui.add(timeDebug, "isPaused");

export const frameTimeTracker = getFrameTimeTracker();
frameTimeTracker.addSample("frame time", 0);

export type RenderArgs = {
  /** Whether the pass should be executed */
  enabled?: boolean;
  /** The command encoder to record commands into */
  commandEncoder: GPUCommandEncoder;
  /** The GBuffers to render to */
  outputTextures: OutputTextures;
  /** The buffer containing the camera position in 3 floats (x,y,z) */
  cameraPositionBuffer: GPUBuffer;
  /** Buffer containing the transformation matrices of the voxel objects */
  transformationMatrixBuffer: GPUBuffer;
  /** Buffer containing the frameTime (deltaTime) and the elapsed frameCount */
  timeBuffer: GPUBuffer;
  /** Buffer containing the view and projection matrices */
  viewProjectionMatricesBuffer?: GPUBuffer;
  /** Float32Array containing the view and projection matrices */
  viewProjectionMatricesArray?: Float32Array;
  /** The timestamp query set to write to for debugging purposes */
  timestampWrites?: GPUComputePassTimestampWrites;
  /** Buffer containing the sun direction in 3 floats (x,y,z) */
  sunDirectionBuffer?: GPUBuffer;
  /** The blue noise texture to use for dithering */
  blueNoiseTextureView?: GPUTextureView;
  /** Buffer containing the BVH acceleration structure */
  bvhBuffer: GPUBuffer;
  /** The 3D texture atlas */
  volumeAtlas: VolumeAtlas;
  /** Texture sampler for linear filtering */
  linearSampler: GPUSampler;
  /** Texture sampler for nearest filtering */
  nearestSampler: GPUSampler;
  camera: Camera;
  cameraTransform: Transform;
  /** Entities with VoxelObject and Transform components */
  renderableEntities: Entity[];
  /** The ECS instance */
  ecs: ECS;
  /** The GPU device */
  device: GPUDevice;
};

export type RenderPass = {
  /** The function to execute the pass, optionally can return the timestamp query size */
  render: (args: RenderArgs) => void;
  /** The label for the pass */
  label?: string;
  /** The size of the timestamp query writes for this pass, optional, will use a size of 2 by default (start and end) */
  timestampLabels?: string[];
};

export const getViewMatrix = (transform: Transform) => {
  const eye = transform.position;
  return mat4.lookAt(eye, vec3.add(eye, transform.direction), transform.up);
};

let skyTexture: GPUTexture;
let computePasses: RenderPass[];
let normalTexture: GBufferTexture;
let albedoTexture: GBufferTexture;
let outputTexture: GBufferTexture;
let depthTexture: GBufferTexture;
let velocityTexture: GBufferTexture;
let worldPositionTexture: GBufferTexture;
let previousWorldPositionTexture: GBufferTexture;
let previousNormalTexture: GBufferTexture;
let blueNoiseTextureView: GPUTextureView;
let timeBuffer: GPUBuffer;
let transformationMatrixBuffer: GPUBuffer;
let viewProjectionMatricesBuffer: GPUBuffer;
let sunDirectionBuffer: GPUBuffer;
let viewProjectionMatricesArray: Float32Array;
let cameraPositionFloatArray: Float32Array;
let bvh: BVH;
let previousJitteredViewProjectionMatrix = mat4.create();
let timestampQuerySet: GPUQuerySet;
let timestampQueryBuffer: GPUBuffer;
let linearSampler: GPUSampler;
let nearestSampler: GPUSampler;
let timestampLabels: string[];

const setupCanvasAndTextures = () => {
  canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  canvas.style.imageRendering = "pixelated";
  resolution = vec2.create(window.innerWidth, window.innerHeight);

  canvas.width = resolution[0];
  canvas.height = resolution[1];

  albedoTexture = new AlbedoTexture(device, resolution[0], resolution[1]);
  normalTexture = new NormalTexture(device, resolution[0], resolution[1]);
  depthTexture = new DepthTexture(device, resolution[0], resolution[1]);
  velocityTexture = new VelocityTexture(device, resolution[0], resolution[1]);
  outputTexture = new OutputTexture(device, resolution[0], resolution[1]);
  worldPositionTexture = new WorldPositionTexture(
    device,
    resolution[0],
    resolution[1],
  );
  previousWorldPositionTexture = new WorldPositionTexture(
    device,
    resolution[0],
    resolution[1],
  );
  previousNormalTexture = new NormalTexture(
    device,
    resolution[0],
    resolution[1],
  );
};

export const init = async (
  device1: GPUDevice,
  volumeAtlas1: VolumeAtlas,
  ecs: ECS,
) => {
  // TODO: make sure device is passed via function param instead
  device = device1;
  volumeAtlas = volumeAtlas1;

  if (!navigator.gpu) {
    throw new Error("WebGPU not supported");
  }

  cameraPositionBuffer = createFloatUniformBuffer(
    device,
    [0, 0, 0, 0],
    "camera position",
  );

  bvh = new BVH(device, []);
  debugUI.setupBVHLogging(bvh);

  setupCanvasAndTextures();

  skyTexture = createSkyTexture(device);
  gpuContext = canvas.getContext("webgpu");
  gpuContext.configure({
    device,
    // format: navigator.gpu.getPreferredCanvasFormat(),
    format: OUTPUT_TEXTURE_FORMAT,
    toneMapping: { mode: "extended" },
  });

  createBlueNoiseTexture(device);

  computePasses = await Promise.all([
    getClearPass(albedoTexture),
    getClearPass(normalTexture),
    getClearPass(velocityTexture),
    getClearPass(worldPositionTexture),
    getClearPass(outputTexture),
    getRasterTracePass(),
    (async () => {
      return {
        label: "copy albedo",
        render: (renderArgs: RenderArgs) => {
          copyGBufferTexture(
            renderArgs.commandEncoder,
            renderArgs.outputTextures.albedoTexture,
            renderArgs.outputTextures.finalTexture,
          );
        },
      };
    })(),
    // getShadowsPass(),
    // getLightsPass(device),
    // getBloomPass(),
    // getSimpleFogPass(),
    // getTaaPass(outputTexture),
    // getTonemapPass(),
    // getMotionBlurPass(),
    // getLutPass("luts/Reeve 38.CUBE"),
    // getVignettePass(10.0),
    // getLightDebugPass(device),
    fullscreenQuad(device),
    // getBoxOutlinePass(device),
  ]);

  timestampLabels = computePasses.reduce((acc, val) => {
    if (val.timestampLabels) {
      return acc.concat(val.timestampLabels);
    }
    return acc.concat(val.label);
  }, []);

  debugUI.setupDebugControls(computePasses);

  linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  if (device.features.has("timestamp-query")) {
    timestampQuerySet = device.createQuerySet({
      type: "timestamp",
      count: 1000, //start and end of each pass
    });
    timestampQueryBuffer = device.createBuffer({
      label: "timestamp query",
      size: 8 * timestampQuerySet.count,
      usage:
        GPUBufferUsage.QUERY_RESOLVE |
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
  }
};

const getTimeBuffer = () => {
  if (!timeBuffer) {
    timeBuffer = createUniformBuffer([frameCount, 0, 0], "time buffer");
  }
  device.queue.writeBuffer(
    timeBuffer,
    4, // offset
    new Float32Array([deltaTime]),
  );
  device.queue.writeBuffer(
    timeBuffer,
    0, // offset
    new Uint32Array([frameCount]),
  );
  device.queue.writeBuffer(
    timeBuffer,
    8, // offset
    new Float32Array([elapsedTime / 1000]),
  );
};

const createBlueNoiseTexture = async (device: GPUDevice) => {
  const blueNoiseTexture = await createTextureFromImage(
    device,
    "blue-noise-rg.png",
    {
      usage: GPUTextureUsage.COPY_SRC,
    },
  );
  blueNoiseTextureView = blueNoiseTexture.createView();
};

const getInverseProjectionMatrix = (projectionMatrix: Mat4) => {
  return mat4.invert(projectionMatrix);
};

const getMatricesBuffer = (camera: Camera, cameraTransform: Transform) => {
  // const jitter = generateJitter(
  //   frameCount,
  //   resolution[0],
  //   resolution[1],
  //   "fieldOfView" in camera.config ? camera.config.fieldOfView : 90,
  //   resolution[0] / resolution[1],
  //   "near" in camera.config ? camera.config.near : 0.1,
  // );
  const jitter: [number, number] = [0, 0];
  const jitteredProjectionMatrix = jitterProjectionMatrix(
    camera.projectionMatrix,
    jitter,
  );

  const viewMatrix = getViewMatrix(cameraTransform);

  const jitteredViewProjectionMatrix = mat4.mul(
    jitteredProjectionMatrix,
    viewMatrix,
  );

  // Update the view projection matrices buffer
  viewProjectionMatricesArray = new Float32Array([
    ...jitteredViewProjectionMatrix,
    ...previousJitteredViewProjectionMatrix,
    ...mat4.invert(jitteredViewProjectionMatrix),
    ...mat4.invert(viewMatrix),
    ...jitteredProjectionMatrix,
    ...mat4.invert(jitteredProjectionMatrix),
    ...viewMatrix,
  ]);
  if (!viewProjectionMatricesBuffer) {
    viewProjectionMatricesBuffer = device.createBuffer({
      size: viewProjectionMatricesArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: "view matrices buffer",
    });
  }
  device.queue.writeBuffer(
    viewProjectionMatricesBuffer,
    0, // offset
    viewProjectionMatricesArray.buffer,
    0, // data offset
    viewProjectionMatricesArray.length * Float32Array.BYTES_PER_ELEMENT,
  );

  // Update the camera position buffer
  const jitteredViewMatrix = mat4.mul(
    getInverseProjectionMatrix(jitteredProjectionMatrix),
    jitteredViewProjectionMatrix,
  );
  const cameraWorldMatrix = mat4.invert(jitteredViewMatrix);
  cameraPositionFloatArray = new Float32Array(
    mat4.getTranslation(cameraWorldMatrix),
  );
  device.queue.writeBuffer(
    cameraPositionBuffer,
    0, // offset
    cameraPositionFloatArray.buffer,
    0, // data offset
    cameraPositionFloatArray.length * Float32Array.BYTES_PER_ELEMENT,
  );
  previousJitteredViewProjectionMatrix = jitteredViewProjectionMatrix;
};

const getSunDirectionBuffer = () => {
  // Rotate sun over time
  let x = Math.cos(elapsedTime / 5000);
  let z = Math.sin(elapsedTime / 5000);
  const newDirection = vec3.create(x, 1, z);

  if (sunDirectionBuffer) {
    writeToFloatUniformBuffer(sunDirectionBuffer, [
      newDirection[0],
      newDirection[1],
      newDirection[2],
    ]);
  } else {
    sunDirectionBuffer = createUniformBuffer(
      [newDirection[0], newDirection[1], newDirection[2]],
      "sun buffer",
    );
  }
};

let cameraPositionBuffer: GPUBuffer;

export const VOXEL_OBJECT_STRUCT_SIZE = 76;

const getVoxelObjectsBuffer = (
  device: GPUDevice,
  ecs: ECS,
  renderableEntities: Entity[],
) => {
  // TODO: reduce the stride
  const size = VOXEL_OBJECT_STRUCT_SIZE * renderableEntities.length;
  if (!transformationMatrixBuffer || size !== transformationMatrixBuffer.size) {
    transformationMatrixBuffer = device.createBuffer({
      size: size * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: "voxel objects buffer",
    });
  }

  renderableEntities.forEach((entity, index) => {
    const buffer = voxelObjectToDataView(
      ecs.getComponents(entity).get(VoxelObject),
      ecs.getComponents(entity).get(Transform),
    ).buffer;

    device.queue.writeBuffer(
      transformationMatrixBuffer,
      index * VOXEL_OBJECT_STRUCT_SIZE * Float32Array.BYTES_PER_ELEMENT, // offset
      buffer,
      0, // data offset
      buffer.byteLength,
    );
  });
};

setInterval(() => {
  debugUI.log(frameTimeTracker.getAverages());
}, 250);

export const frame = async (
  now: number,
  ecs: ECS,
  camera: Camera,
  cameraTransform: Transform,
  renderableEntities: Entity[],
) => {
  if (
    !device ||
    !computePasses ||
    !volumeAtlas ||
    renderableEntities.length === 0
  ) {
    return;
  }

  getMatricesBuffer(camera, cameraTransform);
  getVoxelObjectsBuffer(device, ecs, renderableEntities);
  getTimeBuffer();
  getSunDirectionBuffer();
  const renderableBoundingBoxes = renderableEntities.map((entity) => {
    return getVoxelObjectBoundingBox(
      ecs.getComponents(entity).get(VoxelObject),
      ecs.getComponents(entity).get(Transform),
    );
  });
  bvh.update(renderableBoundingBoxes);

  const commandEncoder = device.createCommandEncoder();
  if (startTime === 0) {
    startTime = now;
  }
  commandEncoder.pushDebugGroup("frame");
  const newElapsedTime = now - startTime;
  if (!timeDebug.isPaused) {
    deltaTime = newElapsedTime - elapsedTime;
    frameTimeTracker.addSample("frame time", deltaTime);
    elapsedTime = newElapsedTime;
    frameCount = (frameCount + 1) % 2048;
  }

  let beginningOfPassWriteIndex = 0;

  computePasses.forEach((computePass, index) => {
    const { render, label } = computePass;
    if (
      debugUI.passesFolder.controllers
        .find((controller) => controller.property === label)
        ?.getValue() === false
    ) {
      return;
    }

    if (device.features.has("timestamp-query")) {
      commandEncoder.clearBuffer(timestampQueryBuffer);
    }
    let timestampWrites: GPUComputePassTimestampWrites | undefined;
    if (device.features.has("timestamp-query")) {
      timestampWrites = {
        querySet: timestampQuerySet,
        beginningOfPassWriteIndex: beginningOfPassWriteIndex,
        endOfPassWriteIndex: beginningOfPassWriteIndex + 1,
      };
    }

    if (label) {
      commandEncoder.pushDebugGroup(label);
    }

    render({
      enabled: (document.getElementById(`flag-${label}`) as HTMLInputElement)
        ?.checked,
      commandEncoder,
      timeBuffer,
      outputTextures: {
        finalTexture: outputTexture,
        albedoTexture,
        normalTexture,
        depthTexture,
        skyTexture,
        velocityTexture,
        worldPositionTexture,
        previousWorldPositionTexture,
        previousNormalTexture,
      },
      cameraPositionBuffer,
      volumeAtlas,
      transformationMatrixBuffer,
      viewProjectionMatricesArray,
      viewProjectionMatricesBuffer,
      timestampWrites,
      sunDirectionBuffer,
      blueNoiseTextureView,
      bvhBuffer: bvh.gpuBuffer,
      linearSampler,
      nearestSampler,
      camera,
      cameraTransform,
      renderableEntities,
      ecs,
      device,
    });
    if (computePass.timestampLabels?.length > 0) {
      beginningOfPassWriteIndex += computePass.timestampLabels.length * 2;
    } else {
      beginningOfPassWriteIndex += 2;
    }
    if (label) {
      commandEncoder.popDebugGroup();
    }
  });
  commandEncoder.popDebugGroup();
  commandEncoder.copyTextureToTexture(
    {
      texture: worldPositionTexture.texture,
    },
    {
      texture: previousWorldPositionTexture.texture,
    },
    {
      width: worldPositionTexture.width,
      height: worldPositionTexture.height,
      depthOrArrayLayers: 0,
    },
  );

  if (device.features.has("timestamp-query")) {
    resolveTimestampQueries(
      timestampLabels,
      timestampQuerySet,
      timestampQueryBuffer,
    );
  }
  device.queue.submit([commandEncoder.finish()]);
};
