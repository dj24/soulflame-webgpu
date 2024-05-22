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

export const getGBufferPass = async (): Promise<RenderPass> => {
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

  const worldPosTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 11,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba32float",
      viewDimension: "2d",
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

  const uniformsBindGroupLayout = device.createBindGroupLayout({
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

  const worldPosReconstructionBindGroupLayout = device.createBindGroupLayout({
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
      { ...worldPosTextureEntry, binding: 2 },
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
    label: "raymarch g-buffer",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout],
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

  const reconstructWorldPosPipeline = await device.createComputePipelineAsync({
    label: "reconstruct world position",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [worldPosReconstructionBindGroupLayout],
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
            let pixel = vec2<i32>(GlobalInvocationID.xy);
            var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
            let depth = textureLoad(depthTex, pixel, 0).r;
            var rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
            var worldPos = cameraPosition + rayDirection * depth;
            if(depth > 0.0) {
              textureStore(worldPosTex, pixel, vec4(worldPos, 1));
            }
            else {
                let surroundingPixels = array<vec2<i32>, 8>(
                    vec2<i32>(0, 0),
                    vec2<i32>(0, 4),
                    vec2<i32>(4, 0),
                    vec2<i32>(4, 4),
                    vec2<i32>(0, -4),
                    vec2<i32>(-4, 0),
                    vec2<i32>(-4, -4),
                    vec2<i32>(4, -4)
                );
                var count = 0.;
                var averageDepth = depth;
                for(var i = 0u; i < 8u; i = i + 1u) {
                    let surroundingPixel = (pixel / 4) * 4 + surroundingPixels[i];
                    let surroundingUV = vec2<f32>(surroundingPixel) / vec2<f32>(resolution);
                    let surroundingDepth = textureLoad(depthTex, surroundingPixel, 0).r;
                    let distanceWeight = f32(1.0) / f32(1.0 + f32(i));
                    if(surroundingDepth > 0.0) {
                        count += distanceWeight;
                        averageDepth += surroundingDepth * distanceWeight;
                    }
                }
                averageDepth = averageDepth / count;
                var rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
                worldPos = cameraPosition + rayDirection * averageDepth;
                textureStore(worldPosTex, pixel, vec4(worldPos, 1));
            }
          }
`,
      }),
      entryPoint: "main",
    },
  });

  const render = ({
    commandEncoder,
    outputTextures,
    cameraPositionBuffer,
    volumeAtlas,
    transformationMatrixBuffer,
    viewProjectionMatricesBuffer,
    timestampWrites,
    bvhBuffer,
  }: RenderArgs) => {
    let computePass = commandEncoder.beginComputePass({ timestampWrites });

    const computeBindGroup = device.createBindGroup({
      layout: uniformsBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: volumeAtlas.atlasTextureView,
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
          resource: outputTextures.normalTexture.view,
        },
        {
          binding: 5,
          resource: outputTextures.albedoTexture.view,
        },
        {
          binding: 6,
          resource: outputTextures.depthTexture.view,
        },
        {
          binding: 7,
          resource: outputTextures.velocityTexture.view,
        },
        {
          binding: 8,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 10,
          resource: {
            buffer: bvhBuffer,
          },
        },
        {
          binding: 12,
          resource: volumeAtlas.paletteTextureView,
        },
      ],
    });

    const reconstructWorldPosBindGroup = device.createBindGroup({
      layout: worldPosReconstructionBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: outputTextures.depthTexture.view,
        },
        {
          binding: 1,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 2,
          resource: outputTextures.worldPositionTexture.view,
        },
        {
          binding: 3,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
      ],
    });

    // Raymarch the scene
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, computeBindGroup);
    const totalPixels = resolution[0] * resolution[1];
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 64),
      Math.ceil(resolution[1] / 32),
    );

    // Reconstruct world position
    computePass.setPipeline(reconstructWorldPosPipeline);
    computePass.setBindGroup(0, reconstructWorldPosBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );

    computePass.end();
  };

  return { render, label: "raymarched g-buffer" };
};
