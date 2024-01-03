import raymarchDepth from "./raymarch-voxels-depth.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import conservativeDepthMin from "./conservative-depth-min.wgsl";
import {
  device,
  debugValues,
  resolution,
  RenderPass,
  RenderArgs,
} from "../app";

const downscaleFactor = 4;
export const getDepthPrepass = async (): Promise<RenderPass> => {
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
          ${raymarchVoxels}
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

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextures,
    cameraPositionBuffer,
    frustumCornerDirectionsBuffer,
    voxelTextureView,
    transformationMatrixBuffer,
  }: RenderArgs) => {
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(rayMarchPipeline);

    const downscaledDepthTextureView = createDownscaledDepthTextureView();

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
    //       resource: voxelTextureView,
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
          resource: outputTextures.depthAndClusterTexture.createView(),
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
