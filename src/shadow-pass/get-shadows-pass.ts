import shadows from "./shadows.wgsl";
import { device, RenderArgs, RenderPass } from "../app";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import bvh from "../shader/bvh.wgsl";
import bvhCoarse from "../shader/bvh-coarse.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import randomCommon from "../random-common.wgsl";
import matrices from "../shader/matrices.wgsl";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

// export const getShadowsPass = async (): Promise<RenderPass> => {
//   return createComputeCompositePass({
//     shaderCode: shadows,
//     effectEntryPoint: "main",
//     compositeEntryPoint: "composite",
//     downscale: 1,
//     label: "shadows",
//     workgroupSizeFactor: [1, 2, 1],
//   });
// };

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
    type: "read-only-storage",
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

const bvhBufferEntry: GPUBindGroupLayoutEntry = {
  binding: 15,
  visibility: GPUShaderStage.COMPUTE,
  buffer: {
    type: "read-only-storage",
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

const previousIntermediaryTextureEntry: GPUBindGroupLayoutEntry = {
  binding: 19,
  visibility: GPUShaderStage.COMPUTE,
  texture: {
    sampleType: "float",
  },
};

const label = "diffuse";

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
  velocityAndWaterEntry,
  bvhBufferEntry,
  worldPosEntry,
  albedoEntry,
  skyCubeTextureEntry,
  previousIntermediaryTextureEntry,
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

export const getShadowsPass = async (): Promise<RenderPass> => {
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
@group(0) @binding(4) var voxels : texture_3d<f32>;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(6) var<storage> voxelObjects : array<VoxelObject>;
@group(0) @binding(7) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(8) var linearSampler : sampler;
@group(0) @binding(9) var intermediaryTexture : texture_2d<f32>;
@group(0) @binding(10) var normalTex : texture_2d<f32>;
@group(0) @binding(11) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(12) var<uniform> time : Time;
@group(0) @binding(13) var nearestSampler : sampler;
@group(0) @binding(14) var velocityAndWaterTex : texture_2d<f32>;
@group(0) @binding(15) var<storage> bvhNodes: array<BVHNode>;
@group(0) @binding(16) var worldPosTex : texture_2d<f32>;
@group(0) @binding(17) var albedoTex : texture_2d<f32>;
@group(0) @binding(18) var skyCube : texture_cube<f32>;
@group(0) @binding(19) var previousTex : texture_2d<f32>;

const DOWNSCALE = 1;
${matrices}
${randomCommon}
${getRayDirection}
${boxIntersection}
${raymarchVoxels}
${bvh}
${bvhCoarse}
${shadows}`;

  const effectPipeline = device.createComputePipeline({
    label,
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

  const compositePipeline = device.createComputePipeline({
    label: `${label} - composite`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [compositeBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "composite",
    },
  });

  const denoisePipeline = device.createComputePipeline({
    label: `${label} - denoise`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [compositeBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "denoise",
    },
  });

  let copyOutputTexture: GPUTexture;
  let copyOutputTextureView: GPUTextureView;
  let intermediaryTexture: GPUTexture;
  let intermediaryTextureView: GPUTextureView;
  let copyIntermediaryTexture: GPUTexture;
  let copyIntermediaryTextureView: GPUTextureView;
  let previousIntermediaryTexture: GPUTexture;
  let previousIntermediaryTextureView: GPUTextureView;

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
    blueNoiseTexture,
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
      const intermediaryDescriptor = {
        size: [
          outputTextures.finalTexture.width,
          outputTextures.finalTexture.height,
          1,
        ],
        format: outputTextures.finalTexture.format,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST,
      };
      intermediaryTexture = device.createTexture(intermediaryDescriptor);
      copyIntermediaryTexture = device.createTexture(intermediaryDescriptor);
      previousIntermediaryTexture = device.createTexture(
        intermediaryDescriptor,
      );
      copyIntermediaryTextureView = copyIntermediaryTexture.createView();
      intermediaryTextureView = intermediaryTexture.createView();
      previousIntermediaryTextureView =
        previousIntermediaryTexture.createView();
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
        binding: 10,
        resource: outputTextures.normalTexture.view,
      },
      {
        binding: 11,
        resource: blueNoiseTexture.createView(),
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
        binding: 15,
        resource: {
          buffer: bvhBuffer,
        },
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
      {
        binding: 19,
        resource: previousIntermediaryTextureView,
      },
    ];

    // Raw traced output
    const bindGroupDescriptor: GPUBindGroupDescriptor = {
      layout: bindGroupLayout,
      entries: [
        ...baseEntries,
        {
          binding: 2, // output texture
          resource: intermediaryTextureView,
        },
      ],
    };

    // Denoise with the previous frame
    const denoiseBindGroupDescriptor: GPUBindGroupDescriptor = {
      layout: compositeBindGroupLayout,
      entries: [
        ...baseEntries,
        {
          binding: 2, // output texture
          resource: copyIntermediaryTextureView,
        },
        {
          binding: 9, // sampled texture
          resource: intermediaryTextureView,
        },
      ],
    };

    // Composite into final image
    const compositeBindGroupDescriptor: GPUBindGroupDescriptor = {
      layout: compositeBindGroupLayout,
      entries: [
        ...baseEntries,
        {
          binding: 2, // output texture
          resource: outputTextures.finalTexture.view,
        },
        {
          binding: 9, // sampled texture
          resource: copyIntermediaryTextureView,
        },
      ],
    };

    const bindGroup = device.createBindGroup(bindGroupDescriptor);
    const compositeBindGroup = device.createBindGroup(
      compositeBindGroupDescriptor,
    );
    const denoiseBindGroup = device.createBindGroup(denoiseBindGroupDescriptor);

    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });

    // Get Effect
    computePass.setPipeline(effectPipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(intermediaryTexture.width / NUM_THREADS_X),
      Math.ceil(intermediaryTexture.height / NUM_THREADS_Y),
    );

    //Denoise
    computePass.setPipeline(denoisePipeline);
    computePass.setBindGroup(0, denoiseBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(intermediaryTexture.width / NUM_THREADS_X),
      Math.ceil(intermediaryTexture.height / NUM_THREADS_Y),
    );

    // Composite into image
    computePass.setPipeline(compositePipeline);
    computePass.setBindGroup(0, compositeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(outputTextures.finalTexture.width / NUM_THREADS_X),
      Math.ceil(outputTextures.finalTexture.height / NUM_THREADS_Y),
    );

    computePass.end();

    // Last texture in the ping-pong was the copy texture, so we use it as our history texture
    commandEncoder.copyTextureToTexture(
      {
        texture: copyIntermediaryTexture,
      },
      {
        texture: previousIntermediaryTexture,
      },
      {
        width: intermediaryTexture.width,
        height: intermediaryTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );
  };
  return { render, label };
};
