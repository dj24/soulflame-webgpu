import gBuffer from "./g-buffer.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import {
  createFloatUniformBuffer,
  writeToFloatUniformBuffer,
} from "../buffer-utils";
import {
  camera,
  device,
  debugValues,
  resolution,
  RenderPass,
  RenderArgs,
} from "../app";
import cornellBox from "../voxel-models/cornell.vxm";

export type OutputTextures = {
  finalTexture: GPUTexture;
  albedoTexture?: GPUTexture;
  normalTexture?: GPUTexture;
  velocityTexture?: GPUTexture;
  depthAndClusterTexture?: GPUTexture;
  debugTexture?: GPUTexture;
  skyTexture?: GPUTexture;
};

export const getGBufferPass = async (): Promise<RenderPass> => {
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

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextures,
    cameraPositionBuffer,
    frustumCornerDirectionsBuffer,
    voxelTextureView,
    transformationMatrixBuffer,
    viewProjectionMatricesBuffer,
  }: RenderArgs) => {
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
          resource: outputTextures.normalTexture.createView(),
        },
        {
          binding: 7,
          resource: outputTextures.albedoTexture.createView(),
        },
        {
          binding: 8,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 9,
          resource: outputTextures.velocityTexture.createView(),
        },
        {
          binding: 10,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
      ],
    });

    const volumeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: pointSampler,
        },
        {
          binding: 1,
          resource: voxelTextureView,
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
