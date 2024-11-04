import { device, RenderPass, RenderArgs, resolution } from "../app";
import {
  GBufferTexture,
  WorldPositionTexture,
} from "../abstractions/g-buffer-texture";
import getRayDirection from "@renderer/shader/get-ray-direction.wgsl";
import boxIntersection from "@renderer/shader/box-intersection.wgsl";
import depth from "@renderer/shader/depth.wgsl";
import tlas from "@renderer/g-buffer/tlas-raymarch.wgsl";
import randomCommon from "@renderer/random-common.wgsl";
import raymarchVoxels from "@renderer/shader/raymarch-voxels.wgsl";
import bvh from "@renderer/shader/bvh.wgsl";
import gBufferRaymarch from "@renderer/g-buffer/g-buffer-raymarch.wgsl";

export type OutputTextures = {
  finalTexture: GBufferTexture;
  albedoTexture?: GBufferTexture;
  normalTexture?: GBufferTexture;
  velocityTexture?: GBufferTexture;
  depthTexture?: GBufferTexture;
  worldPositionTexture?: GBufferTexture;
  skyTexture?: GPUTexture;
  previousWorldPositionTexture?: GBufferTexture;
  previousNormalTexture?: GBufferTexture;
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

const TLAS_RAYMARCH_DOWNSAMPLE = 1;
const TLAS_HITS = 16;

export const getGBufferPass = async (): Promise<RenderPass> => {
  let indirectBuffer: GPUBuffer;
  let screenRayBuffer: GPUBuffer;
  let depthBuffer: GPUBuffer;

  const getTLASRaymarchPass = async () => {
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
        // View projections
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
          buffer: {
            type: "read-only-storage",
          },
        },
      ],
    });

    const rayBufferBindGroupLayout = device.createBindGroupLayout({
      entries: [
        // Screen rays
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "storage",
          },
        },
        // Indirect buffer
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "storage",
          },
        },
      ],
    });

    const pipeline = await device.createComputePipelineAsync({
      label: "raymarch TLAS",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout, rayBufferBindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          code: `
          struct ViewProjectionMatrices {
            viewProjection : mat4x4<f32>,
            previousViewProjection : mat4x4<f32>,
            inverseViewProjection : mat4x4<f32>,
            projection : mat4x4<f32>,
            inverseProjection: mat4x4<f32>
          };
          struct BVHNode {
            leftIndex: i32,
            rightIndex: i32,
            objectCount: u32,
            AABBMin: vec3<f32>,
            AABBMax: vec3<f32>,
            parentIndex: i32,
            siblingIndex: i32,
          };
          @group(0) @binding(0) var<uniform> cameraPosition : vec3<f32>;
          @group(0) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;
          @group(0) @binding(2) var<storage> bvhNodes: array<BVHNode>;
          @group(1) @binding(0) var<storage, read_write> screenRayBuffer : array<vec3<i32>>;
          @group(1) @binding(1) var<storage, read_write> indirectBuffer : array<atomic<u32>>;
          ${getRayDirection}
          ${boxIntersection}
          ${depth}
          ${tlas}
          `,
        }),
        entryPoint: "main",
      },
    });

    let bindGroup: GPUBindGroup;
    let rayBufferBindGroup: GPUBindGroup;

    const enqueuePass = (
      computePass: GPUComputePassEncoder,
      renderArgs: RenderArgs,
    ) => {
      // if (!bindGroup) {
      bindGroup = device.createBindGroup({
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
            resource: {
              buffer: renderArgs.viewProjectionMatricesBuffer,
            },
          },
          {
            binding: 2,
            resource: {
              buffer: renderArgs.bvhBuffer,
            },
          },
        ],
      });
      // }

      if (!rayBufferBindGroup) {
        rayBufferBindGroup = device.createBindGroup({
          layout: rayBufferBindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: { buffer: screenRayBuffer },
            },
            {
              binding: 1,
              resource: { buffer: indirectBuffer },
            },
          ],
        });
      }

      // Raymarch the scene
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      computePass.setBindGroup(1, rayBufferBindGroup);
      computePass.dispatchWorkgroups(
        Math.ceil(resolution[0] / 8),
        Math.ceil(resolution[1] / 8),
      );
    };

    return enqueuePass;
  };

  const getFullRaymarchPass = async () => {
    const timeBufferEntry: GPUBindGroupLayoutEntry = {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: "uniform",
      },
    };

    const blueNoiseEntry: GPUBindGroupLayoutEntry = {
      binding: 9,
      visibility: GPUShaderStage.COMPUTE,
      texture: {
        sampleType: "float",
        viewDimension: "2d",
      },
    };

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
        format: "rgba16float",
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

    const bvhBufferEntry: GPUBindGroupLayoutEntry = {
      binding: 10,
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

    const matricesBufferEntry: GPUBindGroupLayoutEntry = {
      binding: 3,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: "read-only-storage",
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
      label: "raymarch g-buffer",
      entries: [
        timeBufferEntry,
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
        velocityEntry,
        {
          binding: 8,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
          },
        },
        bvhBufferEntry,
        octreeBufferEntry,
        worldPosEntry,
        blueNoiseEntry,
        // Indirect buffer
        {
          binding: 11,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "read-only-storage",
          },
        },
        // Screen rays
        {
          binding: 14,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "read-only-storage",
          },
        },
        // Depth buffer
        {
          binding: 15,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "storage",
          },
        },
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
          struct Time {
            frame: u32,
            deltaTime: f32
          };
          @group(0) @binding(1) var<uniform> time : Time;
          @group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
          @group(0) @binding(3) var<storage> voxelObjects : array<VoxelObject>;
          @group(0) @binding(4) var normalTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(5) var albedoTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(6) var worldPosTex : texture_storage_2d<rgba32float, write>;
          @group(0) @binding(7) var velocityTex : texture_storage_2d<rgba16float, write>;
          @group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
          @group(0) @binding(9) var blueNoiseTex : texture_2d<f32>;
          @group(0) @binding(10) var<storage> bvhNodes: array<BVHNode>;
          @group(0) @binding(11) var<storage> indirectBuffer : array<u32>;
          @group(0) @binding(13) var<storage> octreeBuffer : array<vec2<u32>>;
          @group(0) @binding(14) var<storage> screenRayBuffer : array<vec3<i32>>;
          @group(0) @binding(15) var<storage, read_write> depthBuffer : array<atomic<u32>>;
          
          ${randomCommon}
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

    let bindGroup: GPUBindGroup;

    const enqueuePass = (
      computePass: GPUComputePassEncoder,
      renderArgs: RenderArgs,
    ) => {
      bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 1,
            resource: {
              buffer: renderArgs.timeBuffer,
            },
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
            resource: renderArgs.outputTextures.worldPositionTexture.view,
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
            binding: 9,
            resource: renderArgs.blueNoiseTextureView,
          },
          {
            binding: 10,
            resource: {
              buffer: renderArgs.bvhBuffer,
            },
          },
          {
            binding: 11,
            resource: { buffer: indirectBuffer },
          },
          {
            binding: 13,
            resource: {
              buffer: renderArgs.volumeAtlas.octreeBuffer,
            },
          },
          {
            binding: 14,
            resource: { buffer: screenRayBuffer },
          },
          {
            binding: 15,
            resource: { buffer: depthBuffer },
          },
        ],
      });

      // Raymarch the scene
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      // computePass.dispatchWorkgroupsIndirect(indirectBuffer, 0);
      computePass.dispatchWorkgroups(65000, 1, 1);
    };

    return enqueuePass;
  };

  const renderTLAS = await getTLASRaymarchPass();
  const sparseRayMarch = await getFullRaymarchPass();

  const render = (renderArgs: RenderArgs) => {
    if (!depthBuffer) {
      depthBuffer = device.createBuffer({
        size: resolution[0] * resolution[1] * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!indirectBuffer) {
      indirectBuffer = device.createBuffer({
        size: 4 * 4,
        usage:
          GPUBufferUsage.INDIRECT |
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });

      const uint32 = new Uint32Array(3);
      uint32[0] = 1; // The X value
      uint32[1] = 1; // The Y value
      uint32[2] = 1; // The Z value
      // Write values into a GPUBuffer
      device.queue.writeBuffer(indirectBuffer, 0, uint32, 0, uint32.length);

      const { width, height } = renderArgs.outputTextures.finalTexture;
      const maxScreenRays = width * height;
      const maxBVHHits = 4;
      const stride = 16; // vec3
      screenRayBuffer = device.createBuffer({
        size: maxScreenRays * maxBVHHits * stride,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    }

    const { commandEncoder, timestampWrites } = renderArgs;
    commandEncoder.clearBuffer(indirectBuffer, 0, 4);
    commandEncoder.clearBuffer(screenRayBuffer);
    commandEncoder.clearBuffer(depthBuffer);

    // Sparse raymarch
    let computePass = commandEncoder.beginComputePass({ timestampWrites });
    computePass.end();
    computePass = commandEncoder.beginComputePass({
      timestampWrites: {
        querySet: renderArgs.timestampWrites.querySet,
        beginningOfPassWriteIndex:
          renderArgs.timestampWrites.beginningOfPassWriteIndex + 2,
        endOfPassWriteIndex: renderArgs.timestampWrites.endOfPassWriteIndex + 2,
      },
    });
    renderTLAS(computePass, renderArgs);
    computePass.end();

    computePass = commandEncoder.beginComputePass({
      timestampWrites: {
        querySet: renderArgs.timestampWrites.querySet,
        beginningOfPassWriteIndex:
          renderArgs.timestampWrites.beginningOfPassWriteIndex + 4,
        endOfPassWriteIndex: renderArgs.timestampWrites.endOfPassWriteIndex + 4,
      },
    });
    sparseRayMarch(computePass, renderArgs);
    computePass.end();
  };

  return {
    render,
    label: "primary rays",
    timestampLabels: ["clear TLAS", "TLAS raymarch", "full raymarch"],
  };
};
