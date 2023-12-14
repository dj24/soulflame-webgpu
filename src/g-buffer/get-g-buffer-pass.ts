import blurWGSL from "./raymarch-voxels.wgsl";
import simpleSkyShader from "../composite/simple-sky.wgsl";
import {
  createFloatUniformBuffer,
  writeToFloatUniformBuffer,
} from "../buffer-utils";
import { camera, device, debugValues, resolution } from "../app";
import { create3dTexture } from "../create-3d-texture";
import miniViking from "../voxel-models/mini-viking.vxm";
import {
  getCameraSpaceFrustumCornerDirections,
  getWorldSpaceFrustumCornerDirections,
} from "../get-frustum-corner-directions";

// TODO: make this into more robust type, probably object
type OutputTextureView = [
  finalTexture: GPUTextureView,
  albedoTextureView?: GPUTextureView,
  normalTextureView?: GPUTextureView,
  depthTextureView?: GPUTextureView,
  debugTextureView?: GPUTextureView,
];

export type RenderArgs = {
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextureViews: OutputTextureView;
};

export type RenderPass = {
  fixedUpdate?: () => void;
  render: (args: RenderArgs) => void;
};

const getObjectTransformsWorker = new Worker(
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

  create3dTexture(device, miniViking.sliceFilePaths, miniViking.size).then(
    (texture) => {
      voxelTexture = texture;
    },
  );

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
  }: RenderArgs) => {
    getObjectTransformsWorker.postMessage({
      maxObjectCount: debugValues.maxObjectCount,
      objectCount: debugValues.objectCount,
      scale: debugValues.scale,
      translateX: debugValues.translateX,
      camera,
    });

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
    const cameraPostionBuffer = createFloatUniformBuffer(
      device,
      camera.position as number[],
      "camera position",
    );

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
          binding: 0,
          resource: outputTextureViews[0],
        },
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
            buffer: cameraPostionBuffer,
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
          resource: outputTextureViews[1],
        },
        {
          binding: 7,
          resource: outputTextureViews[2],
        },
        {
          binding: 8,
          resource: outputTextureViews[3],
        },
        {
          binding: 9,
          resource: outputTextureViews[4],
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
