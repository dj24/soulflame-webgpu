import gBufferRaymarch from "./g-buffer-raymarch.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import bvh from "../shader/bvh.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";

import {
  camera,
  device,
  debugValues,
  resolution,
  RenderPass,
  RenderArgs,
} from "../app";
import { GBufferTexture } from "../abstractions/g-buffer-texture";
import { DEPTH_FORMAT } from "../constants";

export type OutputTextures = {
  finalTexture: GBufferTexture;
  albedoTexture?: GBufferTexture;
  normalTexture?: GBufferTexture;
  velocityTexture?: GBufferTexture;
  depthTexture?: GBufferTexture;
  worldPositionTexture?: GBufferTexture;
  skyTexture?: GPUTexture;
};

const getWorldPosReconstructionPipeline = async () => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba32float",
          viewDimension: "2d",
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const pipeline = await device.createComputePipelineAsync({
    label: "reconstruct world position",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          ${getRayDirection}
          struct ViewProjectionMatrices {
            viewProjection : mat4x4<f32>,
            previousViewProjection : mat4x4<f32>,
            inverseViewProjection : mat4x4<f32>,
            projection : mat4x4<f32>,
            inverseProjection: mat4x4<f32>
          };
          
          @group(0) @binding(0) var depthTex : texture_2d<f32>;
          @group(0) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;
          @group(0) @binding(2) var worldPosTex : texture_storage_2d<rgba32float, write>;
          @group(0) @binding(3) var<uniform> cameraPosition : vec3<f32>;
        
          const NEAR = 0.5;
          const FAR = 10000.0;
          
          @compute @workgroup_size(8, 8, 1)
          fn main(
            @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
          ) {
            let resolution = textureDimensions(worldPosTex);
            let pixel = GlobalInvocationID.xy;
            var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
            let depth = textureLoad(depthTex, pixel, 0).r;
            let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
            let worldPos = cameraPosition + rayDirection * depth;
            textureStore(worldPosTex, pixel, vec4(worldPos, 1));
          }
`,
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
          resource: renderArgs.outputTextures.depthTexture.view,
        },
        {
          binding: 1,
          resource: {
            buffer: renderArgs.viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 2,
          resource: renderArgs.outputTextures.worldPositionTexture.view,
        },
        {
          binding: 3,
          resource: {
            buffer: renderArgs.cameraPositionBuffer,
          },
        },
      ],
    });
  };

  return { pipeline, getBindGroup };
};

const getRaymarchPipeline = async () => {
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
          struct IndirectArgs {
            count: atomic<u32>
          };
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
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${bvh}
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
      ],
    });
  };

  return { pipeline, getBindGroup };
};

export const getGBufferPass = async (): Promise<RenderPass> => {
  const worldPosReconstruct = await getWorldPosReconstructionPipeline();

  const rayMarch = await getRaymarchPipeline();

  let computeBindGroup: GPUBindGroup;
  let reconstructWorldPosBindGroup: GPUBindGroup;

  const render = (renderArgs: RenderArgs) => {
    const { commandEncoder, timestampWrites } = renderArgs;
    const computePass = commandEncoder.beginComputePass({ timestampWrites });
    if (!computeBindGroup) {
      computeBindGroup = rayMarch.getBindGroup(renderArgs);
    }
    if (!reconstructWorldPosBindGroup) {
      reconstructWorldPosBindGroup =
        worldPosReconstruct.getBindGroup(renderArgs);
    }

    // Raymarch the scene
    computePass.setPipeline(rayMarch.pipeline);
    computePass.setBindGroup(0, computeBindGroup);
    const totalPixels = resolution[0] * resolution[1];
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 64),
      Math.ceil(resolution[1] / 32),
    );

    // Reconstruct world position
    computePass.setPipeline(worldPosReconstruct.pipeline);
    computePass.setBindGroup(0, reconstructWorldPosBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );

    computePass.end();
  };

  return { render, label: "raymarched g-buffer" };
};
