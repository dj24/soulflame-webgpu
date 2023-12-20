import diffuse from "./diffuse.wgsl";
import randomCommon from "../random-common.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import {
  debugValues,
  device,
  RenderArgs,
  RenderPass,
  resolution,
} from "../app";

export const getDiffusePass = async (): Promise<RenderPass> => {
  const diffusePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${randomCommon}
          ${getRayDirection}
          ${raymarchVoxels}
          ${diffuse}
      `,
      }),
      entryPoint: "main",
    },
  });

  const render = ({
    commandEncoder,
    outputTextureViews,
    frustumCornerDirectionsBuffer,
    voxelTextureView,
    resolutionBuffer,
    cameraPositionBuffer,
  }: RenderArgs) => {
    const computePass = commandEncoder.beginComputePass();

    const gBuffer = device.createBindGroup({
      layout: diffusePipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: outputTextureViews.normalTextureView,
        },
        {
          binding: 1,
          resource: outputTextureViews.albedoTextureView,
        },
        {
          binding: 2,
          resource: outputTextureViews.finalTexture,
        },
        {
          binding: 3,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
      ],
    });

    const uniforms = device.createBindGroup({
      layout: diffusePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 1,
          resource: voxelTextureView,
        },
        {
          binding: 2,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
      ],
    });

    computePass.setPipeline(diffusePipeline);
    computePass.setBindGroup(0, uniforms);
    computePass.setBindGroup(1, gBuffer);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    computePass.end();
  };

  return { render };
};
