import { DEPTH_FORMAT } from "../../constants";
import { device, RenderArgs, resolution } from "../../app";
import getRayDirection from "../../shader/get-ray-direction.wgsl";
import boxIntersection from "../../shader/box-intersection.wgsl";
import raymarchVoxels from "../../shader/raymarch-voxels.wgsl";
import bvh from "../../shader/bvh.wgsl";
import gBufferRaymarch from "../g-buffer-raymarch.wgsl";
import depth from "../../shader/depth.wgsl";

export const getSparseRaymarchPipeline = async () => {
  const normalEntry: GPUBindGroupLayoutEntry = {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "2d",
    },
  };

  const albedoEntry: GPUBindGroupLayoutEntry = {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8unorm",
      viewDimension: "2d",
    },
  };

  const velocityEntry: GPUBindGroupLayoutEntry = {
    binding: 7,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "2d",
    },
  };

  const depthEntry: GPUBindGroupLayoutEntry = {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: DEPTH_FORMAT,
      viewDimension: "2d",
    },
  };

  const bvhBufferEntry: GPUBindGroupLayoutEntry = {
    binding: 10,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  };

  const matricesBufferEntry: GPUBindGroupLayoutEntry = {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  };

  const paletteTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 12,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
      viewDimension: "2d",
    },
  };

  const octreeBufferEntry: GPUBindGroupLayoutEntry = {
    binding: 13,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  };

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "3d",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      matricesBufferEntry,
      normalEntry,
      albedoEntry,
      depthEntry,
      velocityEntry,
      {
        binding: 8,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      bvhBufferEntry,
      paletteTextureEntry,
      octreeBufferEntry,
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
          @group(0) @binding(0) var voxels : texture_3d<f32>;
          @group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
          @group(0) @binding(3) var<storage> voxelObjects : array<VoxelObject>;
          @group(0) @binding(4) var normalTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
          @group(0) @binding(6) var depthWrite : texture_storage_2d<${DEPTH_FORMAT}, write>;
          @group(0) @binding(7) var velocityTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
          @group(0) @binding(10) var<storage> bvhNodes: array<BVHNode>;
          @group(0) @binding(11) var worldPosTex : texture_storage_2d<rgba32float, write>;
          @group(0) @binding(12) var paletteTex : texture_2d<f32>;
          @group(0) @binding(13) var<storage> octreeBuffer : array<u32>;
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
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
          resource: renderArgs.volumeAtlas.atlasTextureView,
        },
        {
          binding: 2,
          resource: {
            buffer: renderArgs.cameraPositionBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: renderArgs.transformationMatrixBuffer,
          },
        },
        {
          binding: 4,
          resource: renderArgs.outputTextures.normalTexture.view,
        },
        {
          binding: 5,
          resource: renderArgs.outputTextures.albedoTexture.view,
        },
        {
          binding: 6,
          resource: renderArgs.outputTextures.depthTexture.view,
        },
        {
          binding: 7,
          resource: renderArgs.outputTextures.velocityTexture.view,
        },
        {
          binding: 8,
          resource: {
            buffer: renderArgs.viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 10,
          resource: {
            buffer: renderArgs.bvhBuffer,
          },
        },
        {
          binding: 12,
          resource: renderArgs.volumeAtlas.paletteTextureView,
        },
        {
          binding: 13,
          resource: {
            buffer: renderArgs.volumeAtlas.octreeBuffer,
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
