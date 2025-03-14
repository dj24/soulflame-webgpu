import { debugValues, RenderArgs, RenderPass } from "../app";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import randomCommon from "../random-common.wgsl";
import matrices from "../shader/matrices.wgsl";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";
import { VoxelObject } from "../voxel-object";

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
    type: "read-only-storage",
  },
};

const voxelsEntry: GPUBindGroupLayoutEntry = {
  binding: 4,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
    viewDimension: "3d",
  },
};

const cameraPositionEntry: GPUBindGroupLayoutEntry = {
  binding: 5,
  visibility: GPUShaderStage.COMPUTE,
  buffer: {
    type: "uniform",
  },
};

const voxelObjectsEntry: GPUBindGroupLayoutEntry = {
  binding: 6,
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

const normalTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 9,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const blueNoiseTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 10,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const timeEntry: GPUBindGroupLayoutEntry = {
  binding: 11,
  visibility: GPUShaderStage.COMPUTE,
  buffer: {
    type: "uniform",
  },
};

const nearestSamplerEntry: GPUBindGroupLayoutEntry = {
  binding: 12,
  visibility: GPUShaderStage.COMPUTE,
  sampler: {},
};

const baseBindGroupLayoutEntries = [
  depthEntry,
  inputTextureEntry,
  outputTextureEntry,
  matricesEntry,
  voxelsEntry,
  cameraPositionEntry,
  voxelObjectsEntry,
  sunDirectionEntry,
  linearSamplerEntry,
  normalTextureEntry,
  blueNoiseTextureEntry,
  timeEntry,
  nearestSamplerEntry,
];

const NUM_THREADS_X = 1;

type ComputePassArgs = {
  device: GPUDevice;
  voxelObjects: VoxelObject[];
  shaderCode: string;
  entryPoint: string;
  label: string;
};

/**
 * Creates a compute pass that outputs directly to the final image, dispatching per object in the scene.
 * @param shaderCode - The shader code containing both the effect and the composite compute kernels.
 * @param entryPoint - The name of the compute kernel that applies the effect.
 * @param label - The label to use for the compute pass.
 */
export const createPerObjectPass = async ({
  device,
  voxelObjects,
  shaderCode,
  entryPoint,
  label,
}: ComputePassArgs): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: baseBindGroupLayoutEntries,
  });

  const code = `
@group(0) @binding(0) var depthTex : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(4) var voxels : texture_3d<f32>;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(6) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>;
@group(0) @binding(7) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(8) var linearSampler : sampler;
@group(0) @binding(9) var normalTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : vec2<u32>;
@group(0) @binding(12) var nearestSampler : sampler;

${matrices}
${randomCommon}
${getRayDirection}
${boxIntersection}
${raymarchVoxels}
${shaderCode}`;

  const effectPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint,
    },
  });

  let copyOutputTexture: GPUTexture;

  let nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  let linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

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
    }

    const commandEncoder = device.createCommandEncoder();
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

    const entries = [
      {
        binding: 0,
        resource: outputTextures.depthTexture.view,
      },
      {
        binding: 1,
        resource: copyOutputTexture.createView(),
      },
      {
        binding: 2,
        resource: outputTextures.finalTexture.view,
      },
      {
        binding: 3,
        resource: {
          buffer: viewProjectionMatricesBuffer,
        },
      },
      {
        binding: 4,
        resource: volumeAtlas.atlasTextureView,
      },
      {
        binding: 5,
        resource: {
          buffer: cameraPositionBuffer,
        },
      },
      {
        binding: 6,
        resource: {
          buffer: transformationMatrixBuffer,
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
        binding: 9,
        resource: outputTextures.normalTexture.view,
      },
      {
        binding: 10,
        resource: blueNoiseTextureView,
      },
      {
        binding: 11,
        resource: {
          buffer: timeBuffer,
        },
      },
      {
        binding: 12,
        resource: nearestSampler,
      },
    ];

    const bindGroupDescriptor: GPUBindGroupDescriptor = {
      layout: bindGroupLayout,
      entries,
    };

    const bindGroup = device.createBindGroup(bindGroupDescriptor);

    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });

    // Get Effect
    computePass.setPipeline(effectPipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(voxelObjects.length / NUM_THREADS_X),
    );

    computePass.end();
  };
  return { render, label };
};
