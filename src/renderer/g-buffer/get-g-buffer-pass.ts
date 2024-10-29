import { device, RenderPass, RenderArgs, resolution } from "../app";
import { GBufferTexture } from "../abstractions/g-buffer-texture";
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

const TLAS_RAYMARCH_DOWNSAMPLE = 8;

export const getGBufferPass = async (): Promise<RenderPass> => {
  let TLASTexture: GPUTexture;
  let TLASTextureView: GPUTextureView;
  let counterBuffer: GPUBuffer;
  let indirectBuffer: GPUBuffer;
  let screenRayBuffer: GPUBuffer;

  // Clears the TLAS texture to be all -1s
  const getClearTLASPass = async () => {
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: "r32sint",
            viewDimension: "3d",
          },
        },
      ],
    });

    const pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          code: `
            @group(0) @binding(0) var outputTex : texture_storage_3d<r32sint, write>;

            @compute @workgroup_size(8, 8, 1)
            fn main(
               @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
            ) {
              textureStore(outputTex, GlobalInvocationID, vec4(-1));
            }
          `,
        }),
        entryPoint: "main",
      },
    });

    let bindGroup: GPUBindGroup;

    const enqueuePass = (computePass: GPUComputePassEncoder) => {
      if (!bindGroup) {
        bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: TLASTextureView,
            },
          ],
        });
      }
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      computePass.dispatchWorkgroups(
        Math.ceil(TLASTexture.width / 8),
        Math.ceil(TLASTexture.height / 8),
        TLASTexture.depthOrArrayLayers,
      );
    };

    return enqueuePass;
  };

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
        // output textures
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: "r32sint",
            access: "write-only",
            viewDimension: "3d",
          },
        },
      ],
    });

    const pipeline = await device.createComputePipelineAsync({
      label: "raymarch TLAS",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
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
          @group(0) @binding(3) var outputTex : texture_storage_3d<r32sint, write>;
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
          {
            binding: 3,
            resource: TLASTextureView,
          },
        ],
      });
      // }
      // Raymarch the scene
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      const downsampledResolution = [
        Math.ceil(resolution[0] / TLAS_RAYMARCH_DOWNSAMPLE),
        Math.ceil(resolution[1] / TLAS_RAYMARCH_DOWNSAMPLE),
      ];
      computePass.dispatchWorkgroups(
        Math.ceil(downsampledResolution[0] / 8),
        Math.ceil(downsampledResolution[1] / 8),
      );
    };

    return enqueuePass;
  };

  const getSparseRaymarchPipeline = async () => {
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
        // TLAS texture
        {
          binding: 11,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: "sint",
            viewDimension: "3d",
          },
        },
        octreeBufferEntry,
        worldPosEntry,
        blueNoiseEntry,
        {
          binding: 12,
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
          @group(0) @binding(11) var TLASTex : texture_3d<i32>;
          @group(0) @binding(13) var<storage> octreeBuffer : array<vec2<u32>>;
          @group(0) @binding(12) var<uniform> TLASIndex: u32;
          
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
    let TLASIndexBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const enqueuePass = (
      computePass: GPUComputePassEncoder,
      renderArgs: RenderArgs,
      TLASTextureZ: number,
    ) => {
      renderArgs.device.queue.writeBuffer(
        TLASIndexBuffer,
        0,
        new Uint32Array([TLASTextureZ]),
      );
      // if (!bindGroup) {
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
            resource: TLASTextureView,
          },
          {
            binding: 12,
            resource: {
              buffer: TLASIndexBuffer,
            },
          },
          {
            binding: 13,
            resource: {
              buffer: renderArgs.volumeAtlas.octreeBuffer,
            },
          },
        ],
      });

      // Raymarch the scene
      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      computePass.dispatchWorkgroups(
        Math.ceil(resolution[0] / TLAS_RAYMARCH_DOWNSAMPLE),
        Math.ceil(resolution[1] / TLAS_RAYMARCH_DOWNSAMPLE),
      );
    };

    return enqueuePass;
  };

  const renderTLAS = await getTLASRaymarchPass();
  const sparseRayMarch = await getSparseRaymarchPipeline();
  const clearTLAS = await getClearTLASPass();

  const render = (renderArgs: RenderArgs) => {
    if (!indirectBuffer) {
      indirectBuffer = device.createBuffer({
        size: 3 * 4,
        usage:
          GPUBufferUsage.INDIRECT |
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });
      counterBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const uint32 = new Uint32Array(3);
      uint32[0] = 1; // The X value
      uint32[1] = 1; // The Y value
      uint32[2] = 1; // The Z value
      // Write values into a GPUBuffer
      device.queue.writeBuffer(indirectBuffer, 0, uint32, 0, uint32.length);

      const { width, height } = renderArgs.outputTextures.finalTexture;
      const maxScreenRays = width * height;
      const bufferSizeBytes = ceilToNearestMultipleOf(maxScreenRays * 4, 4);
      screenRayBuffer = device.createBuffer({
        size: bufferSizeBytes,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    }

    if (!TLASTexture) {
      TLASTexture = device.createTexture({
        size: {
          width: Math.ceil(resolution[0] / TLAS_RAYMARCH_DOWNSAMPLE),
          height: Math.ceil(resolution[1] / TLAS_RAYMARCH_DOWNSAMPLE),
          depthOrArrayLayers: 16,
        },
        format: "r32sint",
        dimension: "3d",
        usage:
          GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
      TLASTextureView = TLASTexture.createView();
    }

    const { commandEncoder, timestampWrites } = renderArgs;

    commandEncoder.clearBuffer(indirectBuffer, 0, 4);
    commandEncoder.clearBuffer(counterBuffer, 0, 4);
    commandEncoder.clearBuffer(screenRayBuffer);

    // Sparse raymarch
    let computePass = commandEncoder.beginComputePass({ timestampWrites });
    clearTLAS(computePass);
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
    // for (let i = 0; i < 4; i++) {
    sparseRayMarch(computePass, renderArgs, 0);
    // sparseRayMarch(computePass, renderArgs, 1);
    // sparseRayMarch(computePass, renderArgs, 2);
    // sparseRayMarch(computePass, renderArgs, 3);
    // sparseRayMarch(computePass, renderArgs, 4);
    // sparseRayMarch(computePass, renderArgs, 5);
    // sparseRayMarch(computePass, renderArgs, 6);
    // sparseRayMarch(computePass, renderArgs, 7);
    // sparseRayMarch(computePass, renderArgs, 8);
    // sparseRayMarch(computePass, renderArgs, 9);
    // sparseRayMarch(computePass, renderArgs, 10);
    // sparseRayMarch(computePass, renderArgs, 11);
    // sparseRayMarch(computePass, renderArgs, 12);
    // sparseRayMarch(computePass, renderArgs, 13);
    // sparseRayMarch(computePass, renderArgs, 14);
    // sparseRayMarch(computePass, renderArgs, 15);

    // }
    computePass.end();
  };

  return {
    render,
    label: "primary rays",
    timestampLabels: ["clear TLAS", "TLAS raymarch", "full raymarch"],
  };
};
