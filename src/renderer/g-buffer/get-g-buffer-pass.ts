import { device, RenderPass, RenderArgs, resolution, frameCount } from "../app";
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
export const getGBufferPass = async (): Promise<RenderPass> => {
  let indirectBuffers: GPUBuffer[] = [];
  let screenRayBuffers: GPUBuffer[] = [];
  let depthBuffer: GPUBuffer;
  let objectIndexBuffer: GPUBuffer;
  let normalBuffer: GPUBuffer;

  const getTLASRaymarchPass = async (index: number) => {
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
            AABBMax: vec3<f32>
          };
          @group(0) @binding(0) var<uniform> cameraPosition : vec3<f32>;
          @group(0) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;
          @group(0) @binding(2) var<storage> bvhNodes: array<BVHNode>;
          @group(1) @binding(0) var<storage, read_write> screenRayBuffer : array<vec3<i32>>;
          @group(1) @binding(1) var<storage, read_write> indirectBuffer : array<atomic<u32>>;
          const INDEX = ${index};
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
      indirectBuffer: GPUBuffer,
      screenRayBuffer: GPUBuffer,
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
        Math.ceil(resolution[0] / 4 / 8),
        Math.ceil(resolution[1] / 4 / 8),
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
        // Object index buffer
        {
          binding: 16,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "storage",
          },
        },
        // Normal buffer
        {
          binding: 17,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "storage",
          },
        },
      ],
    });

    const code = `
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
          @group(0) @binding(16) var<storage, read_write> objectIndexBuffer : array<atomic<u32>>;
          @group(0) @binding(17) var<storage, read_write> normalBuffer : array<atomic<u32>>;
          
          ${randomCommon}
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${bvh}
          ${depth}
          ${gBufferRaymarch}`;

    const pipeline = await device.createComputePipelineAsync({
      label: "raymarch g-buffer",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          code,
        }),
        entryPoint: "main",
      },
    });

    const clearPipeline = await device.createComputePipelineAsync({
      label: "clear object index buffer",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: {
        module: device.createShaderModule({
          code,
        }),
        entryPoint: "clear",
      },
    });

    let bindGroup: GPUBindGroup;

    const enqueuePass = (
      computePass: GPUComputePassEncoder,
      renderArgs: RenderArgs,
      indirectBuffer: GPUBuffer,
      screenRayBuffer: GPUBuffer,
    ) => {
      // TODO: figure out why this needs to be created every frame
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
          {
            binding: 16,
            resource: {
              buffer: objectIndexBuffer,
            },
          },
          {
            binding: 17,
            resource: {
              buffer: normalBuffer,
            },
          },
        ],
      });

      // Clear the object index buffer
      computePass.setBindGroup(0, bindGroup);
      computePass.setPipeline(clearPipeline);
      computePass.dispatchWorkgroups(
        Math.ceil(renderArgs.outputTextures.finalTexture.width / 8),
        Math.ceil(renderArgs.outputTextures.finalTexture.height / 8),
      );

      // Raymarch the scene
      computePass.setPipeline(pipeline);
      computePass.dispatchWorkgroupsIndirect(indirectBuffer, 0);
    };

    return enqueuePass;
  };

  const getOutputToGBufferPass = async () => {
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        // Atomic depth buffer
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "read-only-storage",
          },
        },
        // Object index buffer
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "read-only-storage",
          },
        },
        // World position + depth texture
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: "rgba32float",
            viewDimension: "2d",
          },
        },
        // Albedo texture
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: "rgba16float",
            viewDimension: "2d",
          },
        },
        // Normal texture
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: "rgba16float",
            viewDimension: "2d",
          },
        },
        // Velocity texture
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: "rgba16float",
            viewDimension: "2d",
          },
        },
        // View projections
        {
          binding: 6,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
          },
        },
        // Normal buffer
        {
          binding: 7,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "read-only-storage",
          },
        },
        // Camera position
        {
          binding: 8,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
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
            ${getRayDirection}
            
            struct ViewProjectionMatrices {
              viewProjection : mat4x4<f32>,
              previousViewProjection : mat4x4<f32>,
              inverseViewProjection : mat4x4<f32>,
              projection : mat4x4<f32>,
              inverseProjection: mat4x4<f32>
            };

            @group(0) @binding(0) var<storage> depthBuffer : array<u32>;
            @group(0) @binding(1) var<storage> objectIndexBuffer : array<u32>;
            @group(0) @binding(2) var worldPosTex : texture_storage_2d<rgba32float, write>;
            @group(0) @binding(3) var albedoTex : texture_storage_2d<rgba16float, write>;
            @group(0) @binding(4) var normalTex : texture_storage_2d<rgba16float, write>;
            @group(0) @binding(5) var velocityTex : texture_storage_2d<rgba16float, write>;
            @group(0) @binding(6) var<uniform> viewProjections : ViewProjectionMatrices;
            @group(0) @binding(7) var<storage> normalBuffer : array<u32>;
            @group(0) @binding(8) var<uniform> cameraPosition : vec3<f32>;
                      
            const FAR_PLANE = 10000.0;       
               
            fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
              return index2D.y * width + index2D.x;
            }
            
            fn getDebugColor(index: u32) -> vec4<f32> {
              let colors = array<vec4<f32>, 8>(
                vec4<f32>(1.0, 0.0, 0.0, 1.0),
                vec4<f32>(0.0, 1.0, 0.0, 1.0),
                vec4<f32>(0.0, 0.0, 1.0, 1.0),
                vec4<f32>(1.0, 1.0, 0.0, 1.0),
                vec4<f32>(1.0, 0.0, 1.0, 1.0),
                vec4<f32>(0.0, 1.0, 1.0, 1.0),
                vec4<f32>(1.0, 1.0, 1.0, 1.0),
                vec4<f32>(0.5, 0.5, 0.5, 1.0)
              );
              return colors[index % 8];
            }
                      
            fn decodeDepth(depth: u32) -> f32 {
              let reversedDepth = f32(depth) / 200000.0;
              return FAR_PLANE - reversedDepth;   
            }
            
            fn getVelocityStatic(worldPos: vec3<f32>, viewProjections:ViewProjectionMatrices) -> vec2<f32>{
              let vp = viewProjections.viewProjection;
              let previousVp = viewProjections.previousViewProjection;
            
              let clipSpace = vp * vec4(worldPos.xyz, 1.0);
              let previousClipSpace = previousVp * vec4(worldPos.xyz, 1.0);
            
              let ndc = clipSpace.xyz / clipSpace.w;
              let previousNdc = previousClipSpace.xyz / previousClipSpace.w;
            
              var uv = ndc.xy * 0.5 + 0.5;
              var previousUv = previousNdc.xy * 0.5 + 0.5;
            
              var velocity = previousUv - uv;
              return velocity;
            }
                                  
            @compute @workgroup_size(8,8,1)
            fn main(
            @builtin(global_invocation_id) id : vec3<u32>
            ){
                let texSize = textureDimensions(albedoTex);
                if(any(id.xy >= texSize.xy)) {
                  return;
                }
                let index = convert2DTo1D(texSize.x, id.xy);
                let depth = decodeDepth(depthBuffer[index]);
                let objectIndex = bitcast<i32>(objectIndexBuffer[index]);
                if(objectIndex == -1) {
                    return;
                }
                let depthColor = vec4<f32>(1.0 - depth * 0.001, 0.0, 0.0, 1.0);
                let albedoColor = getDebugColor(u32(objectIndex));
                let normal = unpack4x8snorm(normalBuffer[index]).xyz;
                
                let nDotL = dot(normal, vec3<f32>(0.0, 1.0, 0.0));
                // TODO: remove nDotL here and just output albedo
                textureStore(albedoTex, id.xy, albedoColor * mix(nDotL, 1.0, 0.2));
                textureStore(normalTex, id.xy, vec4<f32>(normal, 0.0));
                let uv = vec2<f32>(f32(id.x) / f32(texSize.x), f32(id.y) / f32(texSize.y));
                let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
                let worldPos = depth * rayDirection + cameraPosition;
                let velocity = getVelocityStatic(worldPos, viewProjections);
                textureStore(velocityTex, id.xy, vec4<f32>(velocity, 0.0, 1.0));
                textureStore(worldPosTex, id.xy, vec4<f32>(worldPos, depth));
            }
          `,
        }),
        entryPoint: "main",
      },
    });

    let bindGroup: GPUBindGroup;

    const render = (
      computePass: GPUComputePassEncoder,
      renderArgs: RenderArgs,
    ) => {
      if (!bindGroup) {
        bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: { buffer: depthBuffer },
            },
            {
              binding: 1,
              resource: { buffer: objectIndexBuffer },
            },
            {
              binding: 2,
              resource: renderArgs.outputTextures.worldPositionTexture.view,
            },
            {
              binding: 3,
              resource: renderArgs.outputTextures.albedoTexture.view,
            },
            {
              binding: 4,
              resource: renderArgs.outputTextures.normalTexture.view,
            },
            {
              binding: 5,
              resource: renderArgs.outputTextures.velocityTexture.view,
            },
            {
              binding: 6,
              resource: {
                buffer: renderArgs.viewProjectionMatricesBuffer,
              },
            },
            {
              binding: 7,
              resource: { buffer: normalBuffer },
            },
            {
              binding: 8,
              resource: {
                buffer: renderArgs.cameraPositionBuffer,
              },
            },
          ],
        });
      }

      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, bindGroup);
      computePass.dispatchWorkgroups(
        Math.ceil(renderArgs.outputTextures.albedoTexture.width / 8),
        Math.ceil(renderArgs.outputTextures.albedoTexture.height / 8),
        1,
      );
    };

    return render;
  };

  const renderTLASPass = await getTLASRaymarchPass(0);
  const sparseRayMarch = await getFullRaymarchPass();
  const outputToGBuffer = await getOutputToGBufferPass();

  const render = (renderArgs: RenderArgs) => {
    if (!depthBuffer) {
      depthBuffer = device.createBuffer({
        size: resolution[0] * resolution[1] * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!objectIndexBuffer) {
      objectIndexBuffer = device.createBuffer({
        size: resolution[0] * resolution[1] * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!normalBuffer) {
      normalBuffer = device.createBuffer({
        size: resolution[0] * resolution[1] * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (indirectBuffers.length === 0) {
      const uint32 = new Uint32Array(4);
      uint32[0] = 1; // The X value
      uint32[1] = 1; // The Y value
      uint32[2] = 1; // The Z value
      uint32[3] = 1; // The workgroup count

      for (let i = 0; i < 16; i++) {
        indirectBuffers[i] = device.createBuffer({
          size: 16,
          usage:
            GPUBufferUsage.INDIRECT |
            GPUBufferUsage.STORAGE |
            GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(
          indirectBuffers[i],
          0,
          uint32,
          0,
          uint32.length,
        );
        screenRayBuffers[i] = device.createBuffer({
          size: 128 * 1024 * 1024, // 128 MB
          usage:
            GPUBufferUsage.STORAGE |
            GPUBufferUsage.COPY_DST |
            GPUBufferUsage.COPY_SRC,
        });
      }
    }

    const { commandEncoder, timestampWrites } = renderArgs;
    commandEncoder.clearBuffer(depthBuffer);

    // Sparse raymarch
    let computePass = commandEncoder.beginComputePass({ timestampWrites });

    renderTLASPass(
      computePass,
      renderArgs,
      indirectBuffers[0],
      screenRayBuffers[0],
    );

    computePass.end();

    computePass = commandEncoder.beginComputePass({
      timestampWrites: {
        querySet: timestampWrites.querySet,
        beginningOfPassWriteIndex:
          timestampWrites.beginningOfPassWriteIndex + 2,
        endOfPassWriteIndex: timestampWrites.endOfPassWriteIndex + 2,
      },
    });

    sparseRayMarch(
      computePass,
      renderArgs,
      indirectBuffers[0],
      screenRayBuffers[0],
    );

    computePass.end();

    computePass = commandEncoder.beginComputePass({
      timestampWrites: {
        querySet: timestampWrites.querySet,
        beginningOfPassWriteIndex:
          timestampWrites.beginningOfPassWriteIndex + 4,
        endOfPassWriteIndex: timestampWrites.endOfPassWriteIndex + 4,
      },
    });

    outputToGBuffer(computePass, renderArgs);

    computePass.end();
  };

  return {
    render,
    label: "primary rays",
    timestampLabels: ["tlas raymarch", "blas raymarch", "output to g-buffer"],
  };
};
