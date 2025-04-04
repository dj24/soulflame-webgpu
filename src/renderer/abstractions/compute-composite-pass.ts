import { device, RenderArgs, RenderPass } from "../app";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import depth from "../shader/depth.wgsl";
import bvh from "../shader/bvh.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import randomCommon from "../random-common.wgsl";
import matrices from "../shader/matrices.wgsl";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

const depthEntry: GPUBindGroupLayoutEntry = {
  binding: 0,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "unfilterable-float",
  },
};

const inputTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 1,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const outputTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 2,
  visibility: GPUShaderStage.COMPUTE,
  storageTexture: {
    format: OUTPUT_TEXTURE_FORMAT,
  },
};

const matricesEntry: GPUBindGroupLayoutEntry = {
  binding: 3,
  visibility: GPUShaderStage.COMPUTE,
  buffer: {
    type: "uniform",
  },
};

const cameraPositionEntry: GPUBindGroupLayoutEntry = {
  binding: 5,
  visibility: GPUShaderStage.COMPUTE,
  buffer: {
    type: "uniform",
  },
};

const sunDirectionEntry: GPUBindGroupLayoutEntry = {
  binding: 7,
  visibility: GPUShaderStage.COMPUTE,
  buffer: {
    type: "uniform",
  },
};

const linearSamplerEntry: GPUBindGroupLayoutEntry = {
  binding: 8,
  visibility: GPUShaderStage.COMPUTE,
  sampler: {},
};

const intermediaryTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 9,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const normalTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 10,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const blueNoiseTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 11,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const timeEntry: GPUBindGroupLayoutEntry = {
  binding: 12,
  visibility: GPUShaderStage.COMPUTE,
  buffer: {
    type: "uniform",
  },
};

const nearestSamplerEntry: GPUBindGroupLayoutEntry = {
  binding: 13,
  visibility: GPUShaderStage.COMPUTE,
  sampler: {},
};

const velocityAndWaterEntry: GPUBindGroupLayoutEntry = {
  binding: 14,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "unfilterable-float",
  },
};

const worldPosEntry: GPUBindGroupLayoutEntry = {
  binding: 16,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "unfilterable-float",
  },
};

const albedoEntry: GPUBindGroupLayoutEntry = {
  binding: 17,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const skyCubeTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 18,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
    viewDimension: "cube",
  },
};

export const baseBindGroupLayoutEntries = [
  depthEntry,
  inputTextureEntry,
  outputTextureEntry,
  matricesEntry,
  cameraPositionEntry,
  sunDirectionEntry,
  linearSamplerEntry,
  normalTextureEntry,
  blueNoiseTextureEntry,
  timeEntry,
  nearestSamplerEntry,
  velocityAndWaterEntry,
  worldPosEntry,
  albedoEntry,
  skyCubeTextureEntry,
];

const NUM_THREADS_X = 8;
const NUM_THREADS_Y = 8;

type ComputeCompositePassArgs = {
  shaderCode: string;
  effectEntryPoint: string;
  compositeEntryPoint: string;
  downscale: number;
  label: string;
  workgroupSizeFactor?: [number, number, number];
};

/**
 * Creates a compute pass that uses an intermediary texture to apply an effect to the final image.
 * @param shaderCode - The shader code containing both the effect and the composite compute kernels.
 * @param effectEntryPoint - The name of the compute kernel that applies the effect.
 * @param compositeEntryPoint - The name of the compute kernel that composites the effect into the final image.
 * @param downscale - The amount to downscale the final image by before applying the effect.
 * @param label - The label to use for the compute pass.
 * @param workgroupSizeFactor - The factor to multiply the main compute workgroup dispatch size by.
 */
export const createComputeCompositePass = async ({
  shaderCode,
  effectEntryPoint,
  compositeEntryPoint,
  downscale,
  label,
  workgroupSizeFactor = [1, 1, 1],
}: ComputeCompositePassArgs): Promise<RenderPass> => {
  if (!Number.isInteger(downscale)) {
    throw new Error("Downscale must be an integer");
  }

  const bindGroupLayout = device.createBindGroupLayout({
    entries: baseBindGroupLayoutEntries,
  });

  const compositeBindGroupLayout = device.createBindGroupLayout({
    entries: [...baseBindGroupLayoutEntries, intermediaryTextureEntry],
  });

  const code = `
struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

@group(0) @binding(0) var depthTex : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(7) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(8) var linearSampler : sampler;
@group(0) @binding(9) var intermediaryTexture : texture_2d<f32>;
@group(0) @binding(10) var normalTex : texture_2d<f32>;
@group(0) @binding(11) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(12) var<uniform> time : Time;
@group(0) @binding(13) var nearestSampler : sampler;
@group(0) @binding(14) var velocityAndWaterTex : texture_2d<f32>;
@group(0) @binding(16) var worldPosTex : texture_2d<f32>;
@group(0) @binding(17) var albedoTex : texture_2d<f32>;
@group(0) @binding(18) var skyCube : texture_cube<f32>;

const DOWNSCALE = ${downscale};
${matrices}
${randomCommon}
${getRayDirection}
${boxIntersection}
${depth}
${shaderCode}`;

  const effectPipeline = device.createComputePipeline({
    label,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: effectEntryPoint,
    },
  });

  const compositePipeline = device.createComputePipeline({
    label: `${label} - composite`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [compositeBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: compositeEntryPoint,
    },
  });

  let copyOutputTexture: GPUTexture;
  let copyOutputTextureView: GPUTextureView;
  let intermediaryTexture: GPUTexture;
  let intermediaryTextureView: GPUTextureView;

  let nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  let linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  let bindGroup: GPUBindGroup;
  let compositeBindGroup: GPUBindGroup;

  const render = ({
    outputTextures,
    timestampWrites,
    viewProjectionMatricesBuffer,
    volumeAtlas,
    cameraPositionBuffer,
    transformationMatrixBuffer,
    sunDirectionBuffer,
    blueNoiseTextureView,
    timeBuffer,
    bvhBuffer,
    commandEncoder,
  }: RenderArgs) => {
    if (!copyOutputTexture) {
      copyOutputTexture = device.createTexture({
        size: [
          outputTextures.finalTexture.width,
          outputTextures.finalTexture.height,
          1,
        ],
        format: outputTextures.finalTexture.format,
        usage: outputTextures.finalTexture.usage,
      });
      copyOutputTextureView = copyOutputTexture.createView();
    }
    if (!intermediaryTexture) {
      intermediaryTexture = device.createTexture({
        size: [
          outputTextures.finalTexture.width / downscale,
          outputTextures.finalTexture.height / downscale,
          1,
        ],
        format: outputTextures.finalTexture.format,
        usage:
          GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
      intermediaryTextureView = intermediaryTexture.createView();
    }
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture.texture, // TODO: pass texture as well as view
      },
      {
        texture: copyOutputTexture,
      },
      {
        width: outputTextures.finalTexture.width,
        height: outputTextures.finalTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );

    if (!bindGroup) {
      const baseEntries = [
        {
          binding: 0,
          resource: outputTextures.depthTexture.view,
        },
        {
          binding: 1,
          resource: copyOutputTextureView,
        },
        {
          binding: 3,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 5,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 7,
          resource: {
            buffer: sunDirectionBuffer,
          },
        },
        {
          binding: 8,
          resource: linearSampler,
        },
        {
          binding: 10,
          resource: outputTextures.normalTexture.view,
        },
        {
          binding: 11,
          resource: blueNoiseTextureView,
        },
        {
          binding: 12,
          resource: {
            buffer: timeBuffer,
          },
        },
        {
          binding: 13,
          resource: nearestSampler,
        },
        {
          binding: 14,
          resource: outputTextures.velocityTexture.view,
        },
        {
          binding: 16,
          resource: outputTextures.worldPositionTexture.view,
        },
        {
          binding: 17,
          resource: outputTextures.albedoTexture.view,
        },
        {
          binding: 18,
          resource: outputTextures.skyTexture.createView({
            dimension: "cube",
          }),
        },
      ];

      const bindGroupDescriptor: GPUBindGroupDescriptor = {
        layout: bindGroupLayout,
        entries: [
          ...baseEntries,
          {
            binding: 2,
            resource: intermediaryTextureView,
          },
        ],
      };

      const compositeBindGroupDescriptor: GPUBindGroupDescriptor = {
        layout: compositeBindGroupLayout,
        entries: [
          ...baseEntries,
          {
            binding: 2,
            resource: outputTextures.finalTexture.view,
          },
          {
            binding: 9,
            resource: intermediaryTextureView,
          },
        ],
      };

      bindGroup = device.createBindGroup(bindGroupDescriptor);
      compositeBindGroup = device.createBindGroup(compositeBindGroupDescriptor);
    }

    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });

    // Get Effect
    computePass.setPipeline(effectPipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(
        intermediaryTexture.width / NUM_THREADS_X / workgroupSizeFactor[0],
      ),
      Math.ceil(
        intermediaryTexture.height / NUM_THREADS_Y / workgroupSizeFactor[1],
      ),
    );

    // Composite into image
    computePass.setPipeline(compositePipeline);
    computePass.setBindGroup(0, compositeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(outputTextures.finalTexture.width / NUM_THREADS_X),
      Math.ceil(outputTextures.finalTexture.height / NUM_THREADS_Y),
    );

    computePass.end();
  };
  return { render, label };
};
