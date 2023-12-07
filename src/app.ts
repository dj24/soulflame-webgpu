import fullscreenQuadShader from "./shader/fullscreentexturedquad.wgsl";
import { createUniformBuffer, writeToUniformBuffer } from "./buffer-utils";
import { ComputePass, createComputePass } from "./compute-pass";
import { Camera, moveCamera } from "./camera";
import { DebugUI } from "./ui";
import "./main.css";
import { animate, spring } from "motion";
import { mat4, Vec2, vec2, Vec3, vec3 } from "wgpu-matrix";
import { VoxelObject } from "./voxel-object";
import treeModel from "./voxel-models/fir-tree.vxm";
import miniViking from "./voxel-models/mini-viking.vxm";

export let device: GPUDevice;
export let gpuContext: GPUCanvasContext;
export let canvas: HTMLCanvasElement;
export let resolution = vec2.zero();
let downscale = 1;
export let scale = 1;
export let translateX = 0;
const startTime = performance.now();
export let elapsedTime = startTime;
export let deltaTime = 0;

const startingCameraPosition = vec3.create(80, 120, 80);
const startingCameraDirection = vec3.normalize(vec3.create(-1, -1, -1));
const startingCameraFieldOfView = 82.5;
export let camera = new Camera({
  fieldOfView: startingCameraFieldOfView,
  position: vec3.create(80, 480, 80),
  direction: vec3.normalize(vec3.create(-1, -1, -1)),
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
      camera.position = vec3.add(
        startPosition,
        vec3.mulScalar(vec3.subtract(targetPosition, startPosition), progress),
      );
      camera.direction = vec3.add(
        startDirection,
        vec3.mulScalar(
          vec3.subtract(targetDirection, startDirection),
          progress,
        ),
      );
      camera.fieldOfView =
        startFieldOfView + (targetFieldOfView - startFieldOfView) * progress;
      scale = startScale + (targetScale - startScale) * progress;
      translateX =
        startTranslateX + (targetTranslateX - startTranslateX) * progress;
    },
    {
      easing: spring({
        restDistance: 0.0001,
        damping: 300,
        stiffness: 700,
        mass: 8,
      }),
    },
  );
};

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
  let downscaledResolution: Vec2;

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
    let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    resolution = vec2.create(
      clientWidth * pixelRatio,
      clientHeight * pixelRatio,
    );
    downscaledResolution = vec2.mulScalar(resolution, 1 / downscale);
    canvas.width = resolution[0];
    canvas.height = resolution[1];
    canvas.style.transform = `scale(${1 / pixelRatio})`;

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
      size: [downscaledResolution[0], downscaledResolution[1], 1],
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
    debugUI.log(`Position: ${camera.position[0].toFixed(
      0,
    )}, ${camera.position[1].toFixed(0)}, ${camera.position[2].toFixed(0)}
    Resolution: ${downscaledResolution[0].toFixed(
      0,
    )}x${downscaledResolution[1].toFixed(0)}
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
        downscaledResolution[0],
        downscaledResolution[1],
      ]);
    } else {
      resolutionBuffer = createUniformBuffer([
        downscaledResolution[0],
        downscaledResolution[1],
      ]);
    }

    const outputTextureView = createOutputTextureView();

    computePasses.forEach((computePass) => {
      const objectSize = miniViking.size as Vec3;
      let m = mat4.identity();
      mat4.translate(m, [translateX, 50, 0], m);
      mat4.translate(m, vec3.divScalar(objectSize, 2), m);
      mat4.rotateY(m, performance.now() * 0.0001, m);
      mat4.scale(m, [scale, scale, scale], m);
      mat4.translate(m, vec3.divScalar(objectSize, -2), m);
      mat4.invert(m, m);
      let voxelObject = new VoxelObject(m, objectSize);
      let voxelObject2 = new VoxelObject(
        mat4.translate(mat4.identity(), [128, 0, 129]),
        [256, 48, 256],
      );
      document.getElementById("matrix").innerHTML = (m as Float32Array).reduce(
        (acc: string, value: number) => {
          return `${acc}<span>${value.toFixed(1)}</span>`;
        },
        "",
      );
      computePass.render({
        commandEncoder,
        resolutionBuffer,
        outputTextureView,
        voxelObjects: [voxelObject, voxelObject2],
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
      console.log({ treeModel, miniViking });
      const computePass = createComputePass();
      renderLoop(device, [computePass]);
    });
  });
} else {
  console.error("WebGPU not supported");
}
