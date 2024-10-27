import randomCommon from "../../random-common.wgsl";
import { device, RenderArgs, resolution } from "../../app";
import getRayDirection from "../../shader/get-ray-direction.wgsl";
import boxIntersection from "../../shader/box-intersection.wgsl";
import raymarchVoxels from "../../shader/raymarch-voxels.wgsl";
import bvh from "../../shader/bvh.wgsl";
import gBufferRaymarch from "../g-buffer-raymarch.wgsl";
import depth from "../../shader/depth.wgsl";

export const getTLASRaymarchPass = async () => {
  const normalEntry: GPUBindGroupLayoutEntry = {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "2d",
    },
  };

  const albedoEntry: GPUBindGroupLayoutEntry = {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "2d",
    },
  };

  const velocityEntry: GPUBindGroupLayoutEntry = {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "2d",
    },
  };

  const bvhBufferEntry: GPUBindGroupLayoutEntry = {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  };

  const worldPosEntry: GPUBindGroupLayoutEntry = {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba32float",
      viewDimension: "2d",
    },
  };

  const bindGroupLayout = device.createBindGroupLayout({
    label: "raymarch tlas",
    entries: [
      // Camera position
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      normalEntry,
      albedoEntry,
      velocityEntry,
      // View projections
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      bvhBufferEntry,
      worldPosEntry,
    ],
  });

  const pipeline = await device.createComputePipelineAsync({
    label: "raymarch g-buffer",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          @group(0) @binding(0) var<uniform> cameraPosition : vec3<f32>;
          @group(0) @binding(1) var normalTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(2) var albedoTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(3) var worldPosTex : texture_storage_2d<rgba32float, write>;
          @group(0) @binding(4) var velocityTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(5) var<uniform> viewProjections : ViewProjectionMatrices;
          @group(0) @binding(6) var<storage> bvhNodes: array<BVHNode>;
          ${getRayDirection}
          ${boxIntersection}
          ${bvh}
          ${depth}
          ${gBufferRaymarch}`,
      }),
      entryPoint: "main",
    },
  });

  const getBindGroup = (renderArgs: RenderArgs) => {
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: renderArgs.cameraPositionBuffer,
          },
        },
        {
          binding: 1,
          resource: renderArgs.outputTextures.normalTexture.view,
        },
        {
          binding: 2,
          resource: renderArgs.outputTextures.albedoTexture.view,
        },
        {
          binding: 3,
          resource: renderArgs.outputTextures.worldPositionTexture.view,
        },
        {
          binding: 4,
          resource: renderArgs.outputTextures.velocityTexture.view,
        },
        {
          binding: 5,
          resource: {
            buffer: renderArgs.viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 6,
          resource: {
            buffer: renderArgs.bvhBuffer,
          },
        },
      ],
    });
  };

  let bindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    renderArgs: RenderArgs,
  ) => {
    if (!bindGroup) {
      bindGroup = getBindGroup(renderArgs);
    }
    // Raymarch the scene
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 16),
      Math.ceil(resolution[1] / 8),
    );
  };

  return enqueuePass;
};
