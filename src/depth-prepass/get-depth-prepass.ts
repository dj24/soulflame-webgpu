import raymarchGBuffer from "../g-buffer/g-buffer-raymarch.wgsl";
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
    if (!downscaledDepthTexture) {
      downscaledDepthTexture = device.createTexture({
        size: [
          Math.ceil(resolution[0] / downscaleFactor),
          Math.ceil(resolution[1] / downscaleFactor),
          1,
        ],
        format: "r32float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.STORAGE_BINDING,
      });
    }
    return downscaledDepthTexture.createView();
  };

  const rayMarchPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          ${boxIntersection}
          ${raymarchVoxels}
          ${getRayDirection}
          ${raymarchGBuffer}`,
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
    volumeAtlas,
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
          binding: 2,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
        {
          binding: 4,
          resource: volumeAtlas.atlasTextureView,
        },
      ],
    });

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
          resource: outputTextures.depthTexture.view,
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

  return { render, label: "depth prepass" };
};
