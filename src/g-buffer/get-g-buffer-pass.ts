import blurWGSL from "./raymarch-voxels.wgsl";
import simpleSkyShader from "../composite/simple-sky.wgsl";
import {
  createFloatUniformBuffer,
  writeToFloatUniformBuffer,
} from "../buffer-utils";
import { camera, device, debugValues, resolution } from "../app";
import { create3dTexture } from "../create-3d-texture";
import cube from "../voxel-models/cube.vxm";

type OutputTextureViews = {
  finalTexture: GPUTextureView;
  albedoTextureView?: GPUTextureView;
  normalTextureView?: GPUTextureView;
  depthAndClusterTextureView?: GPUTextureView;
  debugTextureView?: GPUTextureView;
  skyTextureView?: GPUTextureView;
};

export type RenderArgs = {
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextureViews: OutputTextureViews;
  frustumCornerDirectionsBuffer: GPUBuffer;
  cameraPositionBuffer: GPUBuffer;
};

export type RenderPass = {
  fixedUpdate?: () => void;
  render: (args: RenderArgs) => void;
};

export const getObjectTransformsWorker = new Worker(
  new URL("../get-objects-transforms/objects-worker.ts", import.meta.url),
);

export const getGBufferPass = async (): Promise<RenderPass> => {
  let transformationMatrixBuffer: GPUBuffer;
  let voxelTexture: GPUTexture;

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          ${simpleSkyShader}
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${blurWGSL}`,
      }),
      entryPoint: "main",
    },
  });

  create3dTexture(device, cube.sliceFilePaths, cube.size).then((texture) => {
    voxelTexture = texture;
  });

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

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextureViews,
    cameraPositionBuffer,
    frustumCornerDirectionsBuffer,
  }: RenderArgs) => {
    getObjectTransformsWorker.postMessage({
      maxObjectCount: debugValues.maxObjectCount,
      objectCount: debugValues.objectCount,
      scale: debugValues.scale,
      translateX: debugValues.translateX,
      camera,
      objectSize: cube.size,
    });

    if (!transformationMatrixBuffer) {
      return;
    }

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);

    const pointSampler = device.createSampler({
      magFilter: "nearest", // Nearest-neighbor interpolation for magnification
      minFilter: "nearest", // Nearest-neighbor interpolation for minification
    });

    const computeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 5,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
        {
          binding: 6,
          resource: outputTextureViews.normalTextureView,
        },
        {
          binding: 7,
          resource: outputTextureViews.albedoTextureView,
        },
        {
          binding: 8,
          resource: outputTextureViews.depthAndClusterTextureView,
        },
        {
          binding: 9,
          resource: outputTextureViews.debugTextureView,
        },
        {
          binding: 10,
          resource: outputTextureViews.skyTextureView,
        },
      ],
    });

    // TODO: find way to wait for loading more gracefully
    if (!voxelTexture) {
      computePass.end();
      return;
    }

    const volumeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: pointSampler,
        },
        {
          binding: 1,
          resource: voxelTexture.createView(),
        },
      ],
    });

    computePass.setBindGroup(0, computeBindGroup);
    computePass.setBindGroup(1, volumeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );
    computePass.end();
  };

  return { render };
};
