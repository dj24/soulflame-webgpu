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
import { getDenoisePass } from "./passes/get-denoise-pass";
import { getCompositePass } from "./passes/get-composite-pass";
import { getInterpolatePass } from "./passes/get-interpolation-pass";
import depth from "../shader/depth.wgsl";
import { getBufferPass } from "./passes/get-buffer-pass";

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

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

export const baseBindGroupLayoutEntries = [
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

export const shadowCode = `
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
${depth}
${shadows}`;

const NUM_THREADS_X = 16;
const NUM_THREADS_Y = 8;

export const getShadowsPass = async (): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: baseBindGroupLayoutEntries,
  });

  const effectPipeline = device.createComputePipeline({
    label,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: shadowCode,
      }),
      entryPoint: "main",
    },
  });

  let copyOutputTexture: GPUTexture;
  let copyOutputTextureView: GPUTextureView;
  let intermediaryTexture: GPUTexture;
  let intermediaryTextureView: GPUTextureView;
  let intermediaryTextureViewMip1: GPUTextureView;
  let copyIntermediaryTexture: GPUTexture;
  let copyIntermediaryTextureView: GPUTextureView;
  let copyIntermediaryTextureViewMip1: GPUTextureView;
  let previousIntermediaryTexture: GPUTexture;
  let previousIntermediaryTextureView: GPUTextureView;

  let counterBuffer: GPUBuffer;
  let indirectBuffer: GPUBuffer;
  let screenRayBuffer: GPUBuffer;

  let nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  let linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const denoisePass = await getDenoisePass();
  const compositePass = await getCompositePass();
  const interpolatePass = await getInterpolatePass();
  const bufferPass = await getBufferPass();

  const render = (renderArgs: RenderArgs) => {
    const {
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
    } = renderArgs;
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
      // Groups of 4x4 rays are traced
      const maxScreenRays = (width / 2) * (height / 2);
      const bufferSizeBytes = ceilToNearestMultipleOf(maxScreenRays * 4, 4);
      screenRayBuffer = device.createBuffer({
        size: bufferSizeBytes,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    }

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
      const intermediaryDescriptor: GPUTextureDescriptor = {
        size: [
          outputTextures.finalTexture.width,
          outputTextures.finalTexture.height,
          1,
        ],
        mipLevelCount: 2,
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
      copyIntermediaryTextureView = copyIntermediaryTexture.createView({
        baseMipLevel: 0,
        mipLevelCount: 1,
      });
      intermediaryTextureView = intermediaryTexture.createView({
        baseMipLevel: 0,
        mipLevelCount: 1,
      });
      previousIntermediaryTextureView = previousIntermediaryTexture.createView({
        baseMipLevel: 0,
        mipLevelCount: 1,
      });
      intermediaryTextureViewMip1 = intermediaryTexture.createView({
        baseMipLevel: 1,
        mipLevelCount: 1,
      });
      copyIntermediaryTextureViewMip1 = copyIntermediaryTexture.createView({
        baseMipLevel: 1,
        mipLevelCount: 1,
      });
    }

    commandEncoder.clearBuffer(indirectBuffer, 0, 4);
    commandEncoder.clearBuffer(counterBuffer, 0, 4);
    commandEncoder.clearBuffer(screenRayBuffer);

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
          resource: intermediaryTextureViewMip1,
        },
      ],
    };

    // Trace
    let computePass = commandEncoder.beginComputePass({
      label: "shadow trace",
      timestampWrites,
    });
    const bindGroup = device.createBindGroup(bindGroupDescriptor); // TODO: dont create every frame
    computePass.setPipeline(effectPipeline);
    computePass.setBindGroup(0, bindGroup);
    const groupsX = Math.ceil(
      outputTextures.finalTexture.width / NUM_THREADS_X / 2,
    );
    const groupsY = Math.ceil(
      outputTextures.finalTexture.height / NUM_THREADS_Y / 2,
    );
    computePass.dispatchWorkgroups(groupsX, groupsY);
    computePass.end();

    // Interpolate
    {
      computePass = commandEncoder.beginComputePass({
        label: "shadow interpolate",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + 2,
          endOfPassWriteIndex: timestampWrites.endOfPassWriteIndex + 2,
        },
      });
      interpolatePass(
        computePass,
        renderArgs,
        copyIntermediaryTextureView,
        intermediaryTextureViewMip1,
        indirectBuffer,
        screenRayBuffer,
        counterBuffer,
      );
      computePass.end();
    }

    // Trace full resolution (adapative)
    {
      computePass = commandEncoder.beginComputePass({
        label: "shadow full res",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + 4,
          endOfPassWriteIndex: timestampWrites.endOfPassWriteIndex + 4,
        },
      });
      bufferPass(
        computePass,
        screenRayBuffer,
        indirectBuffer,
        copyIntermediaryTextureView,
        intermediaryTextureView,
        renderArgs,
      );
      computePass.end();
    }

    //Denoise
    {
      computePass = commandEncoder.beginComputePass({
        label: "shadow denoise",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + 6,
          endOfPassWriteIndex: timestampWrites.endOfPassWriteIndex + 6,
        },
      });
      denoisePass(
        computePass,
        baseEntries,
        copyIntermediaryTexture,
        copyIntermediaryTextureView,
        intermediaryTextureView,
      );
      computePass.end();
    }

    // Composite into image
    {
      computePass = commandEncoder.beginComputePass({
        label: "shadow composite",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + 8,
          endOfPassWriteIndex: timestampWrites.endOfPassWriteIndex + 8,
        },
      });
      compositePass(
        computePass,
        baseEntries,
        outputTextures.finalTexture.texture,
        outputTextures.finalTexture.view,
        intermediaryTextureView,
      );
      computePass.end();
    }

    // Last texture in the ping-pong was the copy texture, so we use it as our history texture
    commandEncoder.copyTextureToTexture(
      {
        texture: intermediaryTexture,
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
  return {
    render,
    label,
    timestampLabels: [
      "shadow trace",
      "shadow interpolate",
      "full res shadow",
      "shadow denoise",
      "shadow composite",
    ],
  };
};
