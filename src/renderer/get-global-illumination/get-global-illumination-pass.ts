import { RenderArgs, RenderPass } from "../app";
import computeLPV from "./lpv.compute.wgsl";
const VOLUME_SIZE = 32;
const LABEL = "global illumination";

const layoutEntries: GPUBindGroupLayoutEntry[] = [
  // World position texture
  {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "unfilterable-float",
    },
  },
  // Normal texture
  {
    binding: 3,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  },
  // Output texture
  {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba16float",
      viewDimension: "2d",
    },
  },
  // Camera position
  {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  },
  // Sun direction
  {
    binding: 6,
    visibility: GPUShaderStage.COMPUTE,
    buffer: {
      type: "uniform",
    },
  },
];

const writeLPVEntry: GPUBindGroupLayoutEntry = {
  binding: 1,
  visibility: GPUShaderStage.COMPUTE,
  storageTexture: {
    format: "rgba32float",
    viewDimension: "3d",
  },
};

const readLPVEntry: GPUBindGroupLayoutEntry = {
  binding: 0,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "unfilterable-float",
    viewDimension: "3d",
  },
};

const bindGroupLayoutDescriptor1: GPUBindGroupLayoutDescriptor = {
  entries: [...layoutEntries, writeLPVEntry],
};

const bindGroupLayoutDescriptor2: GPUBindGroupLayoutDescriptor = {
  entries: [...layoutEntries, readLPVEntry],
};

const lpvTextureDescriptor: GPUTextureDescriptor = {
  size: {
    width: VOLUME_SIZE,
    height: VOLUME_SIZE,
    depthOrArrayLayers: VOLUME_SIZE,
  },
  dimension: "3d",
  format: "rgba32float",
  usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
};

export const getGlobalIlluminationPass = async (): Promise<RenderPass> => {
  let lightPropagationTexture: GPUTexture;
  let lightPropagationTextureView: GPUTextureView;
  let bindGroup1: GPUBindGroup;
  let bindGroup2: GPUBindGroup;
  let fillPipeline: GPUComputePipeline;
  let compositePipeline: GPUComputePipeline;

  const render = (renderArgs: RenderArgs) => {
    // Create resources once
    if (!bindGroup1) {
      const bindGroupLayout1 = renderArgs.device.createBindGroupLayout(
        bindGroupLayoutDescriptor1,
      );
      const bindGroupLayout2 = renderArgs.device.createBindGroupLayout(
        bindGroupLayoutDescriptor2,
      );
      lightPropagationTexture =
        renderArgs.device.createTexture(lpvTextureDescriptor);
      lightPropagationTextureView = lightPropagationTexture.createView();
      const baseEntries = [
        {
          binding: 2,
          resource: renderArgs.outputTextures.worldPositionTexture.view,
        },
        {
          binding: 3,
          resource: renderArgs.outputTextures.normalTexture.view,
        },
        {
          binding: 4,
          resource: renderArgs.outputTextures.finalTexture.view,
        },
        {
          binding: 5,
          resource: {
            buffer: renderArgs.cameraPositionBuffer,
          },
        },
        {
          binding: 6,
          resource: {
            buffer: renderArgs.sunDirectionBuffer,
          },
        },
      ];
      bindGroup1 = renderArgs.device.createBindGroup({
        layout: bindGroupLayout1,
        entries: [
          {
            binding: 1,
            resource: lightPropagationTextureView,
          },
          ...baseEntries,
        ],
      });
      bindGroup2 = renderArgs.device.createBindGroup({
        layout: bindGroupLayout2,
        entries: [
          {
            binding: 0,
            resource: lightPropagationTextureView,
          },
          ...baseEntries,
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
            @group(0) @binding(0) var lpvTexRead :  texture_3d<f32>;
            @group(0) @binding(1) var lpvTexWrite : texture_storage_3d<rgba32float, write>;
            @group(0) @binding(2) var worldPosTex : texture_2d<f32>;
            @group(0) @binding(3) var normalTex : texture_2d<f32>;
            @group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
            @group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
            @group(0) @binding(6) var<uniform> sunDirection : vec3<f32>;
            ${computeLPV}`,
          }),
          entryPoint: "fill",
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
            @group(0) @binding(0) var lpvTexRead :  texture_3d<f32>;
            @group(0) @binding(1) var lpvTexWrite : texture_storage_3d<rgba32float, write>;
            @group(0) @binding(2) var worldPosTex : texture_2d<f32>;
            @group(0) @binding(3) var normalTex : texture_2d<f32>;
            @group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
            @group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
            @group(0) @binding(6) var<uniform> sunDirection : vec3<f32>;
            ${computeLPV}`,
          }),
          entryPoint: "composite",
        },
      });
    }

    // Fill the light propagation volume
    {
      const pass = renderArgs.commandEncoder.beginComputePass({
        timestampWrites: renderArgs.timestampWrites,
      });
      pass.setPipeline(fillPipeline);
      pass.setBindGroup(0, bindGroup1);
      pass.dispatchWorkgroups(
        lightPropagationTexture.width / 4,
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
  };

  return {
    label: LABEL,
    render,
    timestampLabels: ["fill probes", "apply light"],
  };
};
