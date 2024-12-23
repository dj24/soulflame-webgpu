import { RenderArgs, RenderPass } from "../app";
import compositeLPV from "./lpv.compute.wgsl";
import fillLPV from "./fill-lpv.compute.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import bvh from "../shader/bvh.wgsl";
import randomCommon from "../random-common.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import {
  copyGBufferTexture,
  createCopyOfGBufferTexture,
} from "@renderer/abstractions/copy-g-buffer-texture";
import { GBufferTexture } from "@renderer/abstractions/g-buffer-texture";
const VOLUME_SIZE = 64;
const VOLUME_SCALE = 4;
const LABEL = "global illumination";

const fillLayoutEntries: GPUBindGroupLayoutEntry[] = [
  // LPV texture
  {
    binding: 0,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "3d",
    },
  },
  // Camera position
  {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  },
  // Sun direction
  {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  },
  // BVH buffer
  {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  },
  // Octree buffer
  {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  },
  // Voxel objects
  {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "read-only-storage",
    },
  },
  // Time buffer
  {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  },
  // Previous lpv texture
  {
    binding: 7,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
      viewDimension: "3d",
    },
  },
];

const compositeLayoutEntries: GPUBindGroupLayoutEntry[] = [
  // LPV texture
  {
    binding: 0,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
      viewDimension: "3d",
    },
  },
  // World position texture
  {
    binding: 1,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "unfilterable-float",
    },
  },
  // Normal texture
  {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  },
  // Output texture
  {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "2d",
    },
  },
  // Camera position
  {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  },
  // Linear sampler
  {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    sampler: {},
  },
  // Current output texture
  {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  },
];

const bindGroupLayoutDescriptor1: GPUBindGroupLayoutDescriptor = {
  entries: fillLayoutEntries,
};

const bindGroupLayoutDescriptor2: GPUBindGroupLayoutDescriptor = {
  entries: compositeLayoutEntries,
};

const lpvTextureDescriptor: GPUTextureDescriptor = {
  size: {
    width: VOLUME_SIZE * 3 + 2, // red, green, blue, 1 gap between each to prevent bleeding
    height: VOLUME_SIZE,
    depthOrArrayLayers: VOLUME_SIZE,
  },
  dimension: "3d",
  format: "rgba16float",
  usage:
    GPUTextureUsage.STORAGE_BINDING |
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.COPY_DST,
};

export const getGlobalIlluminationPass = async (): Promise<RenderPass> => {
  let lightPropagationTexture: GPUTexture;
  let lightPropagationTextureView: GPUTextureView;
  let previousLightPropagationTexture: GPUTexture;
  let previousLightPropagationTextureView: GPUTextureView;
  let bindGroup1: GPUBindGroup;
  let bindGroup2: GPUBindGroup;
  let fillPipeline: GPUComputePipeline;
  let compositePipeline: GPUComputePipeline;
  let copiedOutputTexture: GBufferTexture;

  const render = (renderArgs: RenderArgs) => {
    // Create resources once
    if (!bindGroup1) {
      const bindGroupLayout1 = renderArgs.device.createBindGroupLayout(
        bindGroupLayoutDescriptor1,
      );
      const bindGroupLayout2 = renderArgs.device.createBindGroupLayout(
        bindGroupLayoutDescriptor2,
      );
      const linearSampler = renderArgs.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      });
      copiedOutputTexture = createCopyOfGBufferTexture(
        renderArgs.device,
        renderArgs.outputTextures.finalTexture,
      );
      lightPropagationTexture =
        renderArgs.device.createTexture(lpvTextureDescriptor);
      lightPropagationTextureView = lightPropagationTexture.createView();
      previousLightPropagationTexture =
        renderArgs.device.createTexture(lpvTextureDescriptor);
      previousLightPropagationTextureView =
        previousLightPropagationTexture.createView();

      bindGroup1 = renderArgs.device.createBindGroup({
        layout: bindGroupLayout1,
        entries: [
          {
            binding: 0,
            resource: lightPropagationTextureView,
          },
          {
            binding: 1,
            resource: {
              buffer: renderArgs.cameraPositionBuffer,
            },
          },
          {
            binding: 2,
            resource: {
              buffer: renderArgs.sunDirectionBuffer,
            },
          },
          {
            binding: 3,
            resource: {
              buffer: renderArgs.bvhBuffer,
            },
          },
          {
            binding: 4,
            resource: {
              buffer: renderArgs.volumeAtlas.octreeBuffer,
            },
          },
          {
            binding: 5,
            resource: {
              buffer: renderArgs.transformationMatrixBuffer,
            },
          },
          {
            binding: 6,
            resource: {
              buffer: renderArgs.timeBuffer,
            },
          },
          {
            binding: 7,
            resource: previousLightPropagationTextureView,
          },
        ],
      });
      bindGroup2 = renderArgs.device.createBindGroup({
        layout: bindGroupLayout2,
        entries: [
          {
            binding: 0,
            resource: lightPropagationTextureView,
          },
          {
            binding: 1,
            resource: renderArgs.outputTextures.worldPositionTexture.view,
          },
          {
            binding: 2,
            resource: renderArgs.outputTextures.normalTexture.view,
          },
          {
            binding: 3,
            resource: renderArgs.outputTextures.finalTexture.view,
          },
          {
            binding: 4,
            resource: {
              buffer: renderArgs.cameraPositionBuffer,
            },
          },
          {
            binding: 5,
            resource: linearSampler,
          },
          {
            binding: 6,
            resource: copiedOutputTexture.view,
          },
        ],
      });

      fillPipeline = renderArgs.device.createComputePipeline({
        label: LABEL,
        layout: renderArgs.device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout1],
        }),
        compute: {
          module: renderArgs.device.createShaderModule({
            code: `
            const LPV_SCALE = ${VOLUME_SCALE};
            
            struct Time {
              frame: u32,
              deltaTime: f32,
              elapsed: f32
            };
                        
            ${bvh}
            ${randomCommon}
            @group(0) @binding(0) var lpvTexWrite : texture_storage_3d<rgba16float, write>;
            @group(0) @binding(1) var<uniform> cameraPosition : vec3<f32>;
            @group(0) @binding(2) var<uniform> sunDirection : vec3<f32>;
            @group(0) @binding(3) var<storage, read> bvhNodes : array<BVHNode>;
            @group(0) @binding(4) var<storage, read> octreeBuffer : array<vec4<u32>>;
            @group(0) @binding(5) var<storage> voxelObjects : array<VoxelObject>;
            @group(0) @binding(6) var<uniform> time : Time;
            @group(0) @binding(7) var previousLpvTex : texture_3d<f32>;

            ${boxIntersection}
            ${raymarchVoxels}
            ${fillLPV}`,
          }),
          entryPoint: "main",
        },
      });
      compositePipeline = renderArgs.device.createComputePipeline({
        label: LABEL,
        layout: renderArgs.device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout2],
        }),
        compute: {
          module: renderArgs.device.createShaderModule({
            code: `
            const LPV_SCALE = ${VOLUME_SCALE};
            @group(0) @binding(0) var lpvTexRead :  texture_3d<f32>;
            @group(0) @binding(1) var worldPosTex : texture_2d<f32>;
            @group(0) @binding(2) var normalTex : texture_2d<f32>;
            @group(0) @binding(3) var outputTex : texture_storage_2d<rgba16float, write>;
            @group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;
            @group(0) @binding(5) var linearSampler : sampler;
            @group(0) @binding(6) var currentOutputTexture : texture_2d<f32>;
            ${compositeLPV}`,
          }),
          entryPoint: "main",
        },
      });
    }

    copyGBufferTexture(
      renderArgs.commandEncoder,
      renderArgs.outputTextures.finalTexture,
      copiedOutputTexture,
    );

    // Fill the light propagation volume
    {
      const pass = renderArgs.commandEncoder.beginComputePass({
        timestampWrites: renderArgs.timestampWrites,
      });
      pass.setPipeline(fillPipeline);
      pass.setBindGroup(0, bindGroup1);
      pass.dispatchWorkgroups(
        32 / 4,
        lightPropagationTexture.height / 4,
        lightPropagationTexture.depthOrArrayLayers / 4,
      );
      pass.end();
    }

    // Composite the light propagation volume into the final texture
    {
      const pass = renderArgs.commandEncoder.beginComputePass({
        timestampWrites: {
          querySet: renderArgs.timestampWrites.querySet,
          beginningOfPassWriteIndex:
            renderArgs.timestampWrites.beginningOfPassWriteIndex + 2,
          endOfPassWriteIndex:
            renderArgs.timestampWrites.endOfPassWriteIndex + 2,
        },
      });
      pass.setPipeline(compositePipeline);
      pass.setBindGroup(0, bindGroup2);
      pass.dispatchWorkgroups(
        renderArgs.outputTextures.finalTexture.width / 8,
        renderArgs.outputTextures.finalTexture.height / 8,
        1,
      );
      pass.end();
    }

    // Copy the light propagation texture to the previous light propagation texture
    {
      renderArgs.commandEncoder.copyTextureToTexture(
        {
          texture: lightPropagationTexture,
        },
        {
          texture: previousLightPropagationTexture,
        },
        {
          width: lightPropagationTexture.width,
          height: lightPropagationTexture.height,
          depthOrArrayLayers: lightPropagationTexture.depthOrArrayLayers,
        },
      );
    }
  };

  return {
    label: LABEL,
    render,
    timestampLabels: ["fill probes", "apply light"],
  };
};
