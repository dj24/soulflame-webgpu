import { device, RenderArgs, resolution } from "../../app";
import getRayDirection from "../../shader/get-ray-direction.wgsl";
import boxIntersection from "../../shader/box-intersection.wgsl";
import depth from "../../shader/depth.wgsl";
import tlas from "./tlas-raymarch.wgsl";

export const getTLASRaymarchPass = async () => {
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
          format: "r32uint",
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
          @group(0) @binding(3) var outputTex : texture_storage_3d<r32uint, write>;
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
  let outputTexture: GPUTexture;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    renderArgs: RenderArgs,
  ) => {
    if (!outputTexture) {
      outputTexture = device.createTexture({
        size: {
          width: Math.ceil(resolution[0] / 4),
          height: Math.ceil(resolution[1] / 4),
          depthOrArrayLayers: 16,
        },
        format: "r32uint",
        dimension: "3d",
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
      });
    }
    if (!bindGroup) {
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
            resource: outputTexture.createView(),
          },
        ],
      });
    }
    // Raymarch the scene
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 16),
      Math.ceil(resolution[1] / 8),
    );
  };

  return { enqueuePass, outputTexture };
};
