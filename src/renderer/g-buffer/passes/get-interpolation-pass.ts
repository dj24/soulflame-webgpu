import { device, RenderArgs, resolution } from "../../app";
import { DEPTH_FORMAT } from "../../constants";
import getRayDirection from "../../shader/get-ray-direction.wgsl";
import gBufferInterpolate from "../interpolate.compute.wgsl";
import depth from "../../shader/depth.wgsl";

export const getInterpolatePipeline = async () => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Albedo
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba8unorm",
          viewDimension: "2d",
        },
      },
      // Copy of albedo
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Velocity
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba16float",
          viewDimension: "2d",
        },
      },
      // Copy of velocity
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Depth
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: DEPTH_FORMAT,
          viewDimension: "2d",
        },
      },
      // Copy of depth
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      // Normal
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba16float",
          viewDimension: "2d",
        },
      },
      // Copy of normal
      {
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const cameraBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Camera position
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      // Matrices
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });
  const voxelObjectsBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Voxel objects buffer
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Volume atlas
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "3d",
        },
      },
      // Palette
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const screenRayBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Indirect buffer
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      // Screen rays
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      // Counter buffer
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  const pipeline = await device.createComputePipelineAsync({
    label: "interpolate g-buffer",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        bindGroupLayout,
        cameraBindGroupLayout,
        voxelObjectsBindGroupLayout,
        screenRayBindGroupLayout,
      ],
    }),
    compute: {
      module: device.createShaderModule({
        code: `${depth}${getRayDirection}${gBufferInterpolate}`,
      }),
      entryPoint: "main",
    },
  });

  const getBindGroup = (
    renderArgs: RenderArgs,
    copyAlbedoTextureView: GPUTextureView,
    copyVelocityTextureView: GPUTextureView,
    copyDepthTextureView: GPUTextureView,
    copyNormalTextureView: GPUTextureView,
  ) => {
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: renderArgs.outputTextures.albedoTexture.view,
        },
        {
          binding: 1,
          resource: copyAlbedoTextureView,
        },
        {
          binding: 2,
          resource: renderArgs.outputTextures.velocityTexture.view,
        },
        {
          binding: 3,
          resource: copyVelocityTextureView,
        },
        {
          binding: 4,
          resource: renderArgs.outputTextures.depthTexture.view,
        },
        {
          binding: 5,
          resource: copyDepthTextureView,
        },
        {
          binding: 6,
          resource: renderArgs.outputTextures.normalTexture.view,
        },
        {
          binding: 7,
          resource: copyNormalTextureView,
        },
      ],
    });
  };

  const getScreenRayBindGroup = (
    indirectArgsBuffer: GPUBuffer,
    screenRaysBuffer: GPUBuffer,
    counterBuffer: GPUBuffer,
  ) => {
    return device.createBindGroup({
      layout: screenRayBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: indirectArgsBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: screenRaysBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: counterBuffer,
          },
        },
      ],
    });
  };

  const getCameraBindGroup = (renderArgs: RenderArgs) => {
    return device.createBindGroup({
      layout: cameraBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: renderArgs.cameraPositionBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: renderArgs.viewProjectionMatricesBuffer,
          },
        },
      ],
    });
  };

  const getVoxelObjectsBindGroup = (renderArgs: RenderArgs) => {
    return device.createBindGroup({
      layout: voxelObjectsBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: renderArgs.transformationMatrixBuffer,
          },
        },
        {
          binding: 1,
          resource: renderArgs.volumeAtlas.atlasTextureView,
        },
        {
          binding: 2,
          resource: renderArgs.volumeAtlas.paletteTextureView,
        },
      ],
    });
  };

  let bindGroup: GPUBindGroup;
  let cameraBindGroup: GPUBindGroup;
  let voxelObjectsBindGroup: GPUBindGroup;
  let screenRayBindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    renderArgs: RenderArgs,
    copyAlbedoTextureView: GPUTextureView,
    copyVelocityTextureView: GPUTextureView,
    copyDepthTextureView: GPUTextureView,
    copyNormalTextureView: GPUTextureView,
    indirectBuffer: GPUBuffer,
    screenRayBuffer: GPUBuffer,
    counterBuffer: GPUBuffer,
  ) => {
    if (!bindGroup) {
      bindGroup = getBindGroup(
        renderArgs,
        copyAlbedoTextureView,
        copyVelocityTextureView,
        copyDepthTextureView,
        copyNormalTextureView,
      );
    }
    if (!cameraBindGroup) {
      cameraBindGroup = getCameraBindGroup(renderArgs);
    }
    if (!voxelObjectsBindGroup) {
      voxelObjectsBindGroup = getVoxelObjectsBindGroup(renderArgs);
    }
    if (!screenRayBindGroup) {
      screenRayBindGroup = getScreenRayBindGroup(
        indirectBuffer,
        screenRayBuffer,
        counterBuffer,
      );
    }

    // Interpolate g-buffer
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.setBindGroup(1, cameraBindGroup);
    computePass.setBindGroup(2, voxelObjectsBindGroup);
    computePass.setBindGroup(3, screenRayBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 16),
      Math.ceil(resolution[1] / 8),
    );
  };

  return enqueuePass;
};
