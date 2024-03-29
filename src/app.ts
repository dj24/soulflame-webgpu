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
import { mat4, vec2, vec3 } from "wgpu-matrix";
import { fullscreenQuad } from "./fullscreen-quad/fullscreen-quad";
import { DebugValuesStore } from "./debug-values-store";
import { createTextureFromImage, createTextureFromImages } from "webgpu-utils";
import { create3dTexture } from "./create-3d-texture/create-3d-texture";
import { getVolumeAtlas, VolumeAtlas } from "./volume-atlas";
import { getFrameTimeTracker } from "./frametime-tracker";
import { generateOctreeMips } from "./create-3d-texture/generate-octree-mips";
import { getMotionBlurPass } from "./motion-blur/motion-blur";
import { removeInternalVoxels } from "./create-3d-texture/remove-internal-voxels";
import { getShadowsPass } from "./shadow-pass/get-shadows-pass";
import { getSkyPass } from "./sky-and-fog/get-sky-pass";
import { getVolumetricFog } from "./volumetric-fog/get-volumetric-fog";
import { createTavern, voxelObjects } from "./create-tavern";
import { GetObjectsArgs } from "./get-objects-transforms/objects-worker";
import { isVoxelObjectInFrustrum, VoxelObject } from "./voxel-object";
import { getBoxOutlinePass } from "./box-outline/get-box-outline-pass";
import { BVH } from "./bvh";
import { getDepthPrepass } from "./depth-prepass/get-depth-prepass";
import { getWaterPass } from "./water-pass/get-water-pass";
import { getHelloTrianglePass } from "./hello-triangle/get-hello-triangle-pass";
import { getTaaPass } from "./taa-pass/get-taa-pass";
import { getReflectionsPass } from "./reflections-pass/get-reflections-pass";
import { getLightsPass, Light } from "./lights-pass/get-lights-pass";

export type RenderArgs = {
  enabled?: boolean;
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextures: OutputTextures;
  cameraPositionBuffer: GPUBuffer;
  voxelTextureView: GPUTextureView;
  transformationMatrixBuffer: GPUBuffer;
  timeBuffer: GPUBuffer;
  viewProjectionMatricesBuffer?: GPUBuffer;
  timestampWrites?: GPUComputePassTimestampWrites;
  sunDirectionBuffer?: GPUBuffer;
  blueNoiseTexture?: GPUTexture;
  bvhBuffer: GPUBuffer;
  lights: Light[];
};

export type RenderPass = {
  render: (args: RenderArgs) => GPUCommandBuffer[];
  label?: string;
};

export const debugValues = new DebugValuesStore();

export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = vec2.create(4, 4);
let downscale = 1.0;
let startTime = 0;
export let elapsedTime = startTime;
export let deltaTime = 0;
export let frameCount = 0;

let volumeAtlas: VolumeAtlas;

const startingCameraFieldOfView = 90 * (Math.PI / 180);
export let camera = new Camera({
  fieldOfView: startingCameraFieldOfView,
  // position: vec3.create(-25, 10, -70),
  position: vec3.create(-40, 6, -43),
  direction: vec3.create(0.5, 0, 0.0),
});

const debugUI = new DebugUI();

export const frameTimeTracker = getFrameTimeTracker();
frameTimeTracker.addSample("frame time", 0);

let voxelTextureView: GPUTextureView;
let skyTexture: GPUTexture;

let animationFrameId: ReturnType<typeof requestAnimationFrame>;

const baseLightOffset = [-33.5, 4.5, -45] as [number, number, number];

const torchPositions: Light["position"][] = [
  [-16.468910217285156, 2.6069962978363037, -44.74098205566406],
  [-12.986907958984375, 2.6069962978363037, -44.74098205566406],
  [-12.131904602050781, 3.019996166229248, -37.079986572265625],
  [-16.572906494140625, 3.019996166229248, -37.079986572265625],
  [-6.14190673828125, 3.019996166229248, -37.769989013671875],
  [-3.7419052124023438, 4.989995956420898, -42.18998718261719],
  [-8.631904602050781, 4.989995956420898, -27.739990234375],
  [-8.631904602050781, 13.000996589660645, -39.90599060058594],
  [-14.261909484863281, 13.000996589660645, -39.459991455078125],
  [-24.241905212402344, 13.000996589660645, -39.459991455078125],
  [-26.64190673828125, 13.000996589660645, -41.90998840332031],
  [-26.367904663085938, 13.000996589660645, -47.74998474121094],
  [-34.231903076171875, 13.995996475219727, -51.449981689453125],
  [-35.911903381347656, 13.995996475219727, -51.699981689453125],
  [-43.89190673828125, 13.995996475219727, -51.699981689453125],
  [-50.5819091796875, 14.959996223449707, -32.77998352050781],
  [-42.77190399169922, 12.995996475219727, -26.5479736328125],
  [-39.40190887451172, 12.995996475219727, -26.5479736328125],
  [-35.27190399169922, 12.995996475219727, -26.5479736328125],
  [-28.65190887451172, 12.995996475219727, -25.0999755859375],
  [-24.13190460205078, 14.989995956420898, -27.79998779296875],
  [-27.814903259277344, 4.985996246337891, -12.99298095703125],
  [-27.814903259277344, 4.985996246337891, -5.8699951171875],
  [-33.27190399169922, 4.985996246337891, -3.629974365234375],
  [-42.121910095214844, 4.985996246337891, -3.629974365234375],
  [-50.361907958984375, 4.985996246337891, -12.3699951171875],
  [-50.361907958984375, 4.985996246337891, -21.29998779296875],
  [-50.361907958984375, 4.985996246337891, -29.42999267578125],
  [-35.84690856933594, 3.9849960803985596, -51.3289794921875],
  [-34.194908142089844, 3.9849960803985596, -51.58198547363281],
  [-29.941909790039062, 4.9919962882995605, -50.47398376464844],
  [-23.481903076171875, 4.9919962882995605, -50.47398376464844],
  [-5.621910095214844, 4.9919962882995605, -50.47398376464844],
  [-26.703903198242188, 23.975996017456055, -9.089996337890625],
];

let lights: Light[] = torchPositions.map((position, index) => {
  return {
    position: [position[0], position[1] + 1.0, position[2]],
    size: 3,
    // color: vec3.normalize(
    //   vec3.create(Math.random(), Math.random(), Math.random()),
    // ),
    color: [1, 0.8, 0.4],
  };
});

lights = [lights[0], lights[1]];

const beginRenderLoop = (device: GPUDevice, computePasses: RenderPass[]) => {
  let normalTexture: GPUTexture;
  let albedoTexture: GPUTexture;
  let outputTexture: GPUTexture;
  let depthTexture: GPUTexture;
  let velocityTexture: GPUTexture;
  let blueNoiseTexture: GPUTexture;
  let worldPositionTexture: GPUTexture;

  let timeBuffer: GPUBuffer;
  let resolutionBuffer: GPUBuffer;
  let transformationMatrixBuffer: GPUBuffer;
  let viewProjectionMatricesBuffer: GPUBuffer;
  let sunDirectionBuffer: GPUBuffer;

  let previousInverseViewProjectionMatrix = mat4.create();
  let previousViewProjectionMatrix = mat4.create();

  canvas = document.getElementById("webgpu-canvas") as HTMLCanvasElement;
  canvas.style.imageRendering = "pixelated";
  gpuContext = canvas.getContext("webgpu");
  gpuContext.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  let timestampQuerySet: GPUQuerySet;
  let timestampQueryBuffer: GPUBuffer;
  if (device.features.has("timestamp-query")) {
    timestampQuerySet = device.createQuerySet({
      type: "timestamp",
      count: computePasses.length * 2, //start and end of each pass
    });
    timestampQueryBuffer = device.createBuffer({
      size: 8 * timestampQuerySet.count,
      usage:
        GPUBufferUsage.QUERY_RESOLVE |
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
  }

  const sceneBVH = new BVH(voxelObjects);
  console.log(sceneBVH);

  const nodeCount = sceneBVH.nodes.length;

  let BVHBuffer = sceneBVH.toGPUBuffer(device, nodeCount);

  const init = () => {
    if (depthTexture) {
      depthTexture = null;
    }
    if (normalTexture) {
      normalTexture = null;
    }
    if (albedoTexture) {
      albedoTexture = null;
    }
    if (velocityTexture) {
      velocityTexture = null;
    }
    if (outputTexture) {
      outputTexture = null;
    }
    if (worldPositionTexture) {
      worldPositionTexture = null;
    }
    const { clientWidth, clientHeight } = canvas.parentElement;
    let pixelRatio = 1.0;
    const canvasResolution = vec2.create(
      clientWidth * pixelRatio,
      clientHeight * pixelRatio,
    );
    resolution = vec2.mulScalar(canvasResolution, 1 / downscale);
    canvas.width = canvasResolution[0];
    canvas.height = canvasResolution[1];
    canvas.style.transform = `scale(${1 / pixelRatio})`;
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
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    return outputTexture;
  };

  const createNormalTexture = () => {
    if (!normalTexture) {
      normalTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba16float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    return normalTexture;
  };

  const createDepthTexture = () => {
    if (!depthTexture) {
      depthTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "depth32float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC,
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

  const createVelocityTexture = () => {
    if (!velocityTexture) {
      velocityTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba16float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    return velocityTexture;
  };

  const createWorldPositionTexture = () => {
    if (!worldPositionTexture) {
      worldPositionTexture = device.createTexture({
        size: [resolution[0], resolution[1], 1],
        format: "rgba32float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    return worldPositionTexture;
  };

  const getTimeBuffer = () => {
    if (timeBuffer) {
      writeToUniformBuffer(timeBuffer, [frameCount, 0]);
    } else {
      timeBuffer = createUniformBuffer([frameCount, 0]);
    }
    device.queue.writeBuffer(
      timeBuffer,
      4, // offset
      new Float32Array([deltaTime]),
    );
  };

  const getResolutionBuffer = () => {
    if (resolutionBuffer) {
      writeToUniformBuffer(resolutionBuffer, [resolution[0], resolution[1]]);
    } else {
      resolutionBuffer = createUniformBuffer([resolution[0], resolution[1]]);
    }
  };

  const createBlueNoiseTexture = async () => {
    if (!blueNoiseTexture) {
      blueNoiseTexture = await createTextureFromImage(
        device,
        "blue-noise-rg.png",
        {
          usage: GPUTextureUsage.COPY_SRC,
        },
      );
    }
  };

  const getMatricesBuffer = () => {
    const bufferContents = [
      ...camera.viewProjectionMatrix,
      ...previousViewProjectionMatrix,
      ...camera.inverseViewProjectionMatrix,
      ...previousInverseViewProjectionMatrix,
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
  };

  const getSunDirectionBuffer = () => {
    // Create a rotation matrix for the Y angle
    const rotationMatrix = mat4.identity();
    mat4.rotateY(rotationMatrix, debugValues.sunRotateY, rotationMatrix);

    // Multiply the existing direction vector by the rotation matrix
    const newDirection = vec3.transformMat4(
      vec3.create(0, -1, -1),
      rotationMatrix,
    );

    if (sunDirectionBuffer) {
      writeToFloatUniformBuffer(sunDirectionBuffer, [
        newDirection[0],
        newDirection[1],
        newDirection[2],
      ]);
    } else {
      sunDirectionBuffer = createUniformBuffer([
        newDirection[0],
        newDirection[1],
        newDirection[2],
      ]);
    }
  };

  const resolveTimestampQueries = (commandBuffers: GPUCommandBuffer[]) => {
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.resolveQuerySet(
      timestampQuerySet,
      0,
      timestampQuerySet.count,
      timestampQueryBuffer,
      0,
    );
    commandBuffers.push(commandEncoder.finish());
    const size = timestampQueryBuffer.size;
    const gpuReadBuffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(
      timestampQueryBuffer,
      0,
      gpuReadBuffer,
      0,
      size,
    );
    const copyCommands = copyEncoder.finish();
    device.queue.submit([copyCommands]);
    gpuReadBuffer
      .mapAsync(GPUMapMode.READ)
      .then(() => gpuReadBuffer.getMappedRange())
      .then((arrayBuffer) => {
        const timingsNanoseconds = new BigInt64Array(arrayBuffer);
        const timingsMilliseconds: number[] = [];
        timingsNanoseconds.forEach((nanoseconds) => {
          timingsMilliseconds.push(Number(nanoseconds) / 1e6);
        });
        const computePassExecutionTimes = timingsMilliseconds.reduce(
          (acc, val, index) => {
            if (index % 2 === 0) {
              acc.push(timingsMilliseconds[index + 1] - val);
            }
            return acc;
          },
          [],
        );
        computePassExecutionTimes.forEach((time, index) => {
          const label = computePasses[index].label;
          const inputId = `flag-${label}`;
          const isPassEnabled = (
            document.getElementById(inputId) as HTMLInputElement
          )?.checked;
          if (label && isPassEnabled) {
            frameTimeTracker.addSample(label, time);
          } else {
            frameTimeTracker.clearEntry(label);
          }
        });
      });
  };

  createBlueNoiseTexture();

  const getVoxelObjectsBuffer = () => {
    const voxelObjectsInFrustrum = voxelObjects;

    document.getElementById("objectcount").innerHTML =
      `Objects: ${voxelObjectsInFrustrum.length} / ${voxelObjects.length} in view`;

    const voxelObjectsArray = voxelObjectsInFrustrum.flatMap((voxelObject) =>
      voxelObject.toArray(),
    );

    if (transformationMatrixBuffer) {
      writeToFloatUniformBuffer(transformationMatrixBuffer, voxelObjectsArray);
    } else {
      transformationMatrixBuffer = createFloatUniformBuffer(
        device,
        voxelObjectsArray,
        "voxel object",
      );
      transformationMatrixBuffer = device.createBuffer({
        size: new Float32Array(voxelObjectsArray).byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: false,
      });
    }
  };

  setInterval(() => {
    debugUI.log(frameTimeTracker.toHTML());
  }, 500);

  const frame = (now: number) => {
    if (startTime === 0) {
      startTime = now;
    }

    // Candle flicker
    // lights.forEach((light, index) => {
    //   const octave1 = Math.sin(now / 200 + index) * 0.2;
    //   const octave2 = Math.sin(now / 100 + index) * 0.1;
    //   const octave3 = Math.sin(now / 50) * 0.05;
    //   light.size = 3 + octave1 + octave2 + octave3;
    // });
    // Disco lights
    // lights.forEach((light, index) => {
    //   light.position = [
    //     light.position[0],
    //     torchPositions[index][1] + Math.sin(now / 500 + index) * 4,
    //     light.position[2],
    //   ];
    // });

    const newElapsedTime = now - startTime;
    deltaTime = newElapsedTime - elapsedTime;
    frameTimeTracker.addSample("frame time", deltaTime);
    elapsedTime = newElapsedTime;
    frameCount++;

    getMatricesBuffer();
    getVoxelObjectsBuffer();

    //TODO: handle loading this more gracefully
    if (!transformationMatrixBuffer || !blueNoiseTexture) {
      animationFrameId = requestAnimationFrame(frame);
      return;
    }

    moveCamera();
    camera.update();
    debugValues.update();

    const jitteredCameraPosition = mat4.getTranslation(
      camera.inverseViewMatrix,
    );

    // const jitteredCameraPosition = camera.position;

    document.getElementById("resolution").innerHTML = resolution.join(" x ");

    getTimeBuffer();
    getResolutionBuffer();
    getSunDirectionBuffer();

    const cameraPositionBuffer = createFloatUniformBuffer(
      device,
      jitteredCameraPosition as number[],
      "camera position",
    );

    createAlbedoTexture();
    createNormalTexture();
    createDepthTexture();
    createVelocityTexture();
    createOutputTexture();
    createWorldPositionTexture();

    let commandBuffers: GPUCommandBuffer[] = [];

    voxelTextureView = volumeAtlas.getAtlasTextureView();
    if (!voxelTextureView) {
      animationFrameId = requestAnimationFrame(frame);
      return;
    }

    computePasses.forEach((computePass, index) => {
      const { render, label } = computePass;
      if (
        (document.getElementById(`flag-${label}`) as HTMLInputElement)
          ?.checked === false
      ) {
        return;
      }
      const commandEncoder = device.createCommandEncoder();
      if (device.features.has("timestamp-query")) {
        commandEncoder.clearBuffer(timestampQueryBuffer);
      }
      let timestampWrites: GPUComputePassTimestampWrites | undefined;
      if (device.features.has("timestamp-query")) {
        timestampWrites = {
          querySet: timestampQuerySet,
          beginningOfPassWriteIndex: index * 2,
          endOfPassWriteIndex: index * 2 + 1,
        };
      }

      render({
        commandEncoder,
        resolutionBuffer,
        timeBuffer,
        outputTextures: {
          finalTexture: outputTexture,
          albedoTexture,
          normalTexture,
          depthTexture,
          skyTexture,
          velocityTexture,
          worldPositionTexture,
        },
        cameraPositionBuffer,
        voxelTextureView,
        transformationMatrixBuffer,
        viewProjectionMatricesBuffer,
        timestampWrites,
        sunDirectionBuffer,
        blueNoiseTexture,
        bvhBuffer: BVHBuffer,
        lights,
      }).forEach((commands) => {
        commandBuffers.push(commands);
      });
    });

    if (device.features.has("timestamp-query")) {
      resolveTimestampQueries(commandBuffers);
    }

    device.queue.submit(commandBuffers);
    animationFrameId = requestAnimationFrame(frame);
    previousInverseViewProjectionMatrix = camera.inverseViewProjectionMatrix;
    previousViewProjectionMatrix = camera.viewProjectionMatrix;
  };

  init();
  window.onresize = init;
  animationFrameId = requestAnimationFrame(frame);
};

const start = async () => {
  if (!navigator.gpu) {
    console.error("WebGPU not supported");
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!device) {
    try {
      device = await adapter.requestDevice({
        requiredFeatures: ["timestamp-query"],
        requiredLimits: { maxColorAttachmentBytesPerSample: 64 },
      });
    } catch (e) {
      device = await adapter.requestDevice();
    }
  }

  console.debug(device.limits);
  // skyTexture = await createTextureFromImages(device, [
  //   "cubemaps/town-square/posx.jpg",
  //   "cubemaps/town-square/negx.jpg",
  //   "cubemaps/town-square/posy.jpg",
  //   "cubemaps/town-square/negy.jpg",
  //   "cubemaps/town-square/posz.jpg",
  //   "cubemaps/town-square/negz.jpg",
  // ]);
  volumeAtlas = await getVolumeAtlas(device);

  await createTavern(device, volumeAtlas);

  const computePassPromises: Promise<RenderPass>[] = [
    getHelloTrianglePass(),
    // getGBufferPass(),
    getReflectionsPass(),
    getShadowsPass(),
    getLightsPass(),
    // getSkyPass(),
    // getMotionBlurPass(),
    // getDiffusePass(),
    // getVolumetricFog(),
    // getTaaPass(),
    // getBoxOutlinePass(),
    // getWaterPass(),

    fullscreenQuad(device),
  ];

  const computePasses = await Promise.all(computePassPromises);

  beginRenderLoop(device, await Promise.all(computePasses));

  document.getElementById("flags").innerHTML = computePasses.reduce(
    (acc, pass) => {
      if (!pass.label) {
        return acc;
      }
      const id = `flag-${pass.label}`;
      return `${acc}<div class="debug-row">
                    <label for="${id}">
                        ${pass.label}
                    </label>
                    <div>
                        <input id="${id}" type="checkbox" checked>
                   </div>
                </div>`;
    },
    "",
  );
};

let startPromise = start();
//
// window.onresize = async () => {
//   await startPromise;
//   cancelAnimationFrame(animationFrameId);
//   start();
// };
