import gBuffer from "./g-buffer.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import {
  createFloatUniformBuffer,
  writeToFloatUniformBuffer,
} from "../buffer-utils";
import { camera, device, debugValues, resolution } from "../app";
import { create3dTexture } from "../create-3d-texture";
import cube from "../voxel-models/cube.vxm";
import cornellBox from "../voxel-models/cornell.vxm";
import { mat4 } from "wgpu-matrix";
import { VoxelObject } from "../voxel-object";

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
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${gBuffer}`,
      }),
      entryPoint: "main",
    },
  });

  create3dTexture(device, cornellBox.sliceFilePaths, cornellBox.size).then(
    (texture) => {
      voxelTexture = texture;
    },
  );

  // const voxelObject = new VoxelObject(mat4.identity(), cornellBox.size);
  //
  // const voxelObjects = [voxelObject];
  //
  // transformationMatrixBuffer = createFloatUniformBuffer(
  //   device,
  //   voxelObjects.flatMap((voxelObject) => voxelObject.toArray()),
  //   "voxel object",
  // );

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
      objectSize: cornellBox.size,
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
