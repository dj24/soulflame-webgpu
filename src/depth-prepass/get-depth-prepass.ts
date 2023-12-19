import raymarchDepth from "./raymarch-voxels-depth.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import conservativeDepthMin from "./conservative-depth-min.wgsl";
import {
  createFloatUniformBuffer,
  writeToFloatUniformBuffer,
} from "../buffer-utils";
import { camera, device, debugValues, resolution } from "../app";
import { create3dTexture } from "../create-3d-texture";
import cube from "../voxel-models/cube.vxm";
import {
  getObjectTransformsWorker,
  RenderArgs,
  RenderPass,
} from "../g-buffer/get-g-buffer-pass";

const downscaleFactor = 4;
export const getDepthPrepass = async (): Promise<RenderPass> => {
  let transformationMatrixBuffer: GPUBuffer;
  let downscaledDepthTexture: GPUTexture;

  const createDownscaledDepthTextureView = () => {
    if (downscaledDepthTexture) {
      downscaledDepthTexture.destroy();
    }
    downscaledDepthTexture = device.createTexture({
      size: [
        Math.ceil(resolution[0] / downscaleFactor),
        Math.ceil(resolution[1] / downscaleFactor),
        1,
      ],
      format: "rg32sint",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return downscaledDepthTexture.createView();
  };

  const rayMarchPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${boxIntersection}
          ${getRayDirection}
          ${raymarchDepth}`,
      }),
      entryPoint: "main",
    },
  });

  const depthMinPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: conservativeDepthMin,
      }),
      entryPoint: "main",
    },
  });

  const voxelTexture = await create3dTexture(
    device,
    cube.sliceFilePaths,
    cube.size,
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
    cameraPositionBuffer,
    frustumCornerDirectionsBuffer,
  }: RenderArgs) => {
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(rayMarchPipeline);

    const downscaledDepthTextureView = createDownscaledDepthTextureView();

    // TODO: find way to wait for loading more gracefully
    if (!voxelTexture) {
      computePass.end();
      return;
    }

    if (!transformationMatrixBuffer) {
      return;
    }

    const computeBindGroup = device.createBindGroup({
      layout: rayMarchPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: downscaledDepthTextureView,
        },
        {
          binding: 1,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
      ],
    });

    // const volumeBindGroup = device.createBindGroup({
    //   layout: rayMarchPipeline.getBindGroupLayout(1),
    //   entries: [
    //     {
    //       binding: 0,
    //       resource: pointSampler,
    //     },
    //     {
    //       binding: 1,
    //       resource: voxelTexture.createView(),
    //     },
    //   ],
    // });
    // computePass.setBindGroup(1, volumeBindGroup);

    const downscaledResolution = [
      Math.ceil(resolution[0] / downscaleFactor),
      Math.ceil(resolution[1] / downscaleFactor),
    ];

    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(downscaledResolution[0] / 8),
      Math.ceil(downscaledResolution[1] / 8),
    );

    computePass.setPipeline(depthMinPipeline);
    const depthMinBindGroup = device.createBindGroup({
      layout: depthMinPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: downscaledDepthTextureView,
        },
        {
          binding: 1,
          resource: outputTextureViews.depthAndClusterTextureView,
        },
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
      ],
    });

    computePass.setBindGroup(0, depthMinBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );

    computePass.end();
  };

  return { render };
};
