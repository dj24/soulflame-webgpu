import { device, RenderArgs, RenderPass, resolution } from "../app";
import { Vec3 } from "wgpu-matrix";
import lightsCompute from "./lights.compute.wgsl";
import restirSpatial from "./restir-spatial.compute.wgsl";
import restirTemporal from "./restir-temporal.compute.wgsl";
import lightsComposite from "./lights-composite.compute.wgsl";
import bvh from "../shader/bvh.wgsl";
import randomCommon from "../random-common.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import computeDenoise from "./denoise.compute.wgsl";
import computeVariance from "./variance.compute.wgsl";
import { OUTPUT_TEXTURE_FORMAT } from "@renderer/constants";
import { getTaaPass } from "@renderer/taa-pass/get-taa-pass";
import {
  GBufferTexture,
  gBufferTextureFactory,
} from "@renderer/abstractions/g-buffer-texture";

export type Light = {
  position: [number, number, number];
  size: number;
  color: [number, number, number] | Vec3;
};

const LIGHT_BUFFER_STRIDE = 32;
const DOWNSCALE_FACTOR = 2;
const RESERVOIR_DECAY = 0.5;
const MAX_SAMPLES = 50000;
const RESERVOIR_TEXTURE_FORMAT: GPUTextureFormat = "rgba32float";

const LightTexture = gBufferTextureFactory("lights", OUTPUT_TEXTURE_FORMAT);

export const getLightsPass = async (device: GPUDevice): Promise<RenderPass> => {
  // Bind group layouts
  const bindGroupLayout = device.createBindGroupLayout({
    label: "lights-bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "non-filtering",
        },
      },
      // World positions texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      // Normal texture
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Light buffer
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Output texture
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba16float",
        },
      },
      // Reservoir texture
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: RESERVOIR_TEXTURE_FORMAT,
        },
      },
      // Input texture
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Octree buffer
      {
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Object matrix buffer
      {
        binding: 8,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // BVH buffer
      {
        binding: 9,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Blue noise texture
      {
        binding: 10,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Time buffer
      {
        binding: 11,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      // Camera position
      {
        binding: 12,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      //linear sampler
      {
        binding: 13,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "filtering",
        },
      },
    ],
  });
  const gBufferBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // World positions texture
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      // Normal texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Velocity texture
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const lightConfigBindGroupLayout = device.createBindGroupLayout({
    label: "light-config-bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });
  const copyReservoirTextureLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const temporalBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Velocity texture
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Previous reservoir texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Copy reservoir texture
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Previous world position texture
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const spatialBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Copy Reservoir texture
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const clearReservoirTextureLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: RESERVOIR_TEXTURE_FORMAT,
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: OUTPUT_TEXTURE_FORMAT,
        },
      },
    ],
  });
  const svgfConfigBindGroupLayout = device.createBindGroupLayout({
    label: "svgf-config-bind-group-layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      // Reservoir texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const denoiseBindGroupLayout = device.createBindGroupLayout({
    label: "denoise-bind-group-layout",
    entries: [
      // Input texture
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // normal texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // world position texture
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Output texture
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba16float",
        },
      },
      // A-Trous rate
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      // Sampler
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "filtering",
        },
      },
      // Sampler
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "non-filtering",
        },
      },
      // Time buffer
      {
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      // Variance texture
      {
        binding: 8,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
    ],
  });
  const varianceBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Input texture
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      //Previous texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
        },
      },
      // Output texture
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "r32float",
        },
      },
    ],
  });

  const code = `
const DOWN_SAMPLE_FACTOR = ${DOWNSCALE_FACTOR};
const MAX_SAMPLES = ${MAX_SAMPLES};
const RESERVOIR_DECAY = ${RESERVOIR_DECAY};
@group(0) @binding(7) var<storage, read> octreeBuffer : array<vec2<u32>>;
@group(0) @binding(8) var<storage> voxelObjects : array<VoxelObject>;
@group(0) @binding(9) var<storage> bvhNodes: array<BVHNode>;

${boxIntersection}
${bvh}
${randomCommon}
${raymarchVoxels}

${lightsCompute}`;

  // Pipelines
  const pipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "main",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        bindGroupLayout,
        lightConfigBindGroupLayout,
        copyReservoirTextureLayout,
      ],
    }),
  });
  const denoisePipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: computeDenoise,
      }),
      entryPoint: "main",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [denoiseBindGroupLayout, svgfConfigBindGroupLayout],
    }),
  });
  const compositePipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: `
        const DOWN_SAMPLE_FACTOR = ${DOWNSCALE_FACTOR};
        ${lightsComposite}`,
      }),
      entryPoint: "composite",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, svgfConfigBindGroupLayout],
    }),
  });
  const spatialPipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: `
            const DOWN_SAMPLE_FACTOR = ${DOWNSCALE_FACTOR};
            const MAX_SAMPLES = ${MAX_SAMPLES};
            const RESERVOIR_DECAY = ${RESERVOIR_DECAY};
            @group(0) @binding(7) var<storage, read> octreeBuffer : array<vec2<u32>>;
            @group(0) @binding(8) var<storage> voxelObjects : array<VoxelObject>;
            @group(0) @binding(9) var<storage> bvhNodes: array<BVHNode>;
            
            ${boxIntersection}
            ${bvh}
            ${randomCommon}
            ${raymarchVoxels}
            
            ${restirSpatial}`,
      }),
      entryPoint: "spatial",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, spatialBindGroupLayout],
    }),
  });
  const temporalPipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: `
            const DOWN_SAMPLE_FACTOR = ${DOWNSCALE_FACTOR};
            const MAX_SAMPLES = ${MAX_SAMPLES};
            const RESERVOIR_DECAY = ${RESERVOIR_DECAY};
            ${restirTemporal}`,
      }),
      entryPoint: "main",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, temporalBindGroupLayout],
    }),
  });
  const clearReservoirPipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var reservoirTex : texture_storage_2d<${RESERVOIR_TEXTURE_FORMAT}, write>;
        @group(0) @binding(1) var lightTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @compute @workgroup_size(8,8,1)
        fn main(
        @builtin(global_invocation_id) id : vec3<u32>
        ){
            textureStore(reservoirTex, id.xy, vec4(0.0));
            textureStore(lightTex, id.xy, vec4(0.0));
        }
          `,
      }),
      entryPoint: "main",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [clearReservoirTextureLayout],
    }),
  });
  const variancePipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code: computeVariance,
      }),
      entryPoint: "main",
    },
    layout: device.createPipelineLayout({
      bindGroupLayouts: [varianceBindGroupLayout, gBufferBindGroupLayout],
    }),
  });

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
  });
  const linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
  });

  let lightBuffer: GPUBuffer;
  let bindGroup: GPUBindGroup;
  let lightConfigBindGroup: GPUBindGroup;
  let reservoirTexture: GPUTexture;
  let rerervoirTextureView: GPUTextureView;
  let previousReservoirTexture: GPUTexture;
  let previousReservoirTextureView: GPUTextureView;
  let copyReservoirTexture: GPUTexture;
  let copyReservoirTextureView: GPUTextureView;
  let lightConfigBuffer: GPUBuffer;
  let temporalBindGroup: GPUBindGroup;
  let spatialBindGroup: GPUBindGroup;
  let svgfConfigBuffer: GPUBuffer;
  let svgfConfigBindGroup: GPUBindGroup;
  let clearReservoirBindGroup: GPUBindGroup;
  let denoiseBindGroup: GPUBindGroup;
  let atrousRateBuffer: GPUBuffer;
  let copyReservoirBindGroup: GPUBindGroup;
  let varianceTexture: GPUTexture;
  let varianceTextureView: GPUTextureView;
  let previousVarianceTexture: GPUTexture;
  let previousVarianceTextureView: GPUTextureView;
  let lightTexture = new LightTexture(device, resolution[0], resolution[1]);
  let varianceBindGroup: GPUBindGroup;
  let gBufferBindGroup: GPUBindGroup;
  let copyLightTexture: GPUTexture;
  let copyLightTextureView: GPUTextureView;

  const taaSubpass = await getTaaPass(lightTexture);

  // Debug Controls
  let lightConfig = {
    constantAttenuation: 0.1,
    linearAttenuation: 0.2,
    quadraticAttenuation: 0.05,
    lightWeightCutOff: 300,
  };
  let svgfConfig = {
    normalSigma: 0.2,
    varianceSigma: 4,
    blueNoiseSCale: 0,
    spatialSigma: 0.75,
  };
  let passConfig = {
    spatialEnabled: false,
    temporalEnabled: true,
    denoiseEnabled: true,
    maxDenoiseRate: 4,
  };
  const folder = (window as any).debugUI.gui.addFolder("lighting");
  folder.add(lightConfig, "constantAttenuation", 0, 1.0, 0.1);
  folder.add(lightConfig, "linearAttenuation", 0.01, 1, 0.01);
  folder.add(lightConfig, "quadraticAttenuation", 0.005, 0.1, 0.001);
  folder.add(lightConfig, "lightWeightCutOff", 0, 500, 1);
  folder.add(svgfConfig, "normalSigma", 0.1, 2, 0.05);
  folder.add(svgfConfig, "varianceSigma", 0.1, 8, 0.05);
  folder.add(svgfConfig, "spatialSigma", 0.2, 4, 0.05);
  folder.add(svgfConfig, "blueNoiseSCale", 0, 10, 0.1);
  folder.add(passConfig, "spatialEnabled");
  folder.add(passConfig, "temporalEnabled");
  folder.add(passConfig, "denoiseEnabled");
  folder.add(passConfig, "maxDenoiseRate", 1, 16, 1);

  const render = (args: RenderArgs) => {
    const {
      commandEncoder,
      outputTextures,
      timestampWrites,
      lights,
      volumeAtlas,
      transformationMatrixBuffer,
      bvhBuffer,
      blueNoiseTextureView,
      timeBuffer,
      cameraPositionBuffer,
    } = args;

    if (!svgfConfigBuffer) {
      svgfConfigBuffer = device.createBuffer({
        label: "svgf-config-buffer",
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    if (!reservoirTexture) {
      reservoirTexture = device.createTexture({
        size: {
          width: outputTextures.finalTexture.width,
          height: outputTextures.finalTexture.height,
        },
        format: RESERVOIR_TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
      });
      rerervoirTextureView = reservoirTexture.createView();
    }

    if (!previousReservoirTexture) {
      previousReservoirTexture = device.createTexture({
        size: {
          width: reservoirTexture.width,
          height: reservoirTexture.height,
        },
        format: RESERVOIR_TEXTURE_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      previousReservoirTextureView = previousReservoirTexture.createView();
    }

    if (!copyReservoirTexture) {
      copyReservoirTexture = device.createTexture({
        size: {
          width: reservoirTexture.width,
          height: reservoirTexture.height,
        },
        format: RESERVOIR_TEXTURE_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      copyReservoirTextureView = copyReservoirTexture.createView();
    }

    if (!copyReservoirBindGroup) {
      copyReservoirBindGroup = device.createBindGroup({
        layout: copyReservoirTextureLayout,
        entries: [
          {
            binding: 0,
            resource: copyReservoirTextureView,
          },
        ],
      });
    }

    if (!svgfConfigBindGroup) {
      svgfConfigBindGroup = device.createBindGroup({
        layout: svgfConfigBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: svgfConfigBuffer,
            },
          },
          {
            binding: 1,
            resource: copyReservoirTextureView,
          },
        ],
      });
    }

    if (!lightConfigBuffer) {
      const stride = 4;
      lightConfigBuffer = device.createBuffer({
        label: "light-config-buffer",
        size: stride * 5,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    if (!lightBuffer) {
      lightBuffer = device.createBuffer({
        size: LIGHT_BUFFER_STRIDE * lights.length,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!atrousRateBuffer) {
      atrousRateBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    if (!varianceTexture) {
      varianceTexture = device.createTexture({
        size: {
          width: outputTextures.finalTexture.width,
          height: outputTextures.finalTexture.height,
        },
        format: "r32float",
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
      });
      varianceTextureView = varianceTexture.createView();
    }

    if (!previousVarianceTexture) {
      previousVarianceTexture = device.createTexture({
        size: {
          width: outputTextures.finalTexture.width,
          height: outputTextures.finalTexture.height,
        },
        format: "r32float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      previousVarianceTextureView = previousVarianceTexture.createView();
    }

    if (!copyLightTexture) {
      copyLightTexture = device.createTexture({
        size: {
          width: outputTextures.finalTexture.width,
          height: outputTextures.finalTexture.height,
        },
        format: "rgba16float",
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      });
      copyLightTextureView = copyLightTexture.createView();
    }

    if (!clearReservoirBindGroup) {
      clearReservoirBindGroup = device.createBindGroup({
        layout: clearReservoirTextureLayout,
        entries: [
          {
            binding: 0,
            resource: reservoirTexture.createView(),
          },
          {
            binding: 1,
            resource: copyLightTextureView,
          },
        ],
      });
    }

    if (!denoiseBindGroup) {
      denoiseBindGroup = device.createBindGroup({
        layout: denoiseBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: lightTexture.view,
          },
          {
            binding: 1,
            resource: outputTextures.normalTexture.view,
          },
          {
            binding: 2,
            resource: outputTextures.worldPositionTexture.view,
          },
          {
            binding: 3,
            resource: copyLightTextureView,
          },
          {
            binding: 4,
            resource: {
              buffer: atrousRateBuffer,
            },
          },
          {
            binding: 5,
            resource: linearSampler,
          },
          {
            binding: 6,
            resource: nearestSampler,
          },
          {
            binding: 7,
            resource: {
              buffer: timeBuffer,
            },
          },
          {
            binding: 8,
            resource: varianceTextureView,
          },
        ],
      });
    }

    if (!temporalBindGroup) {
      temporalBindGroup = device.createBindGroup({
        layout: temporalBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: outputTextures.velocityTexture.view,
          },
          {
            binding: 1,
            resource: previousReservoirTextureView,
          },
          {
            binding: 2,
            resource: copyReservoirTextureView,
          },
          {
            binding: 3,
            resource: outputTextures.previousWorldPositionTexture.view,
          },
        ],
      });
    }

    if (!spatialBindGroup) {
      spatialBindGroup = device.createBindGroup({
        layout: spatialBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: copyReservoirTextureView,
          },
        ],
      });
    }

    if (!lightConfigBindGroup) {
      lightConfigBindGroup = device.createBindGroup({
        label: "light-config-bind-group",
        layout: lightConfigBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: lightConfigBuffer,
            },
          },
        ],
      });
    }

    if (!varianceBindGroup) {
      varianceBindGroup = device.createBindGroup({
        layout: varianceBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: lightTexture.view,
          },
          {
            binding: 1,
            resource: previousVarianceTextureView,
          },
          {
            binding: 2,
            resource: varianceTextureView,
          },
        ],
      });
    }

    if (!gBufferBindGroup) {
      gBufferBindGroup = device.createBindGroup({
        layout: gBufferBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: outputTextures.worldPositionTexture.view,
          },
          {
            binding: 1,
            resource: outputTextures.normalTexture.view,
          },
          {
            binding: 2,
            resource: outputTextures.velocityTexture.view,
          },
        ],
      });
    }

    device.queue.writeBuffer(
      svgfConfigBuffer,
      0,
      new Float32Array([
        svgfConfig.normalSigma,
        svgfConfig.varianceSigma,
        svgfConfig.blueNoiseSCale,
        svgfConfig.spatialSigma,
      ]),
    );

    device.queue.writeBuffer(
      lightConfigBuffer,
      0,
      new Float32Array([
        lightConfig.constantAttenuation,
        lightConfig.linearAttenuation,
        lightConfig.quadraticAttenuation,
        lightConfig.lightWeightCutOff,
      ]),
    );

    // if (!bindGroup) {
    bindGroup = device.createBindGroup({
      label: "lights-bind-group",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: nearestSampler,
        },
        {
          binding: 1,
          resource: outputTextures.worldPositionTexture.view,
        },
        {
          binding: 2,
          resource: outputTextures.normalTexture.view,
        },
        {
          binding: 3,
          resource: {
            buffer: lightBuffer,
          },
        },
        {
          binding: 4,
          resource: lightTexture.view,
        },
        {
          binding: 5,
          resource: rerervoirTextureView,
        },
        {
          binding: 6,
          resource: copyLightTextureView,
        },
        {
          binding: 7,
          resource: {
            buffer: volumeAtlas.octreeBuffer,
          },
        },
        {
          binding: 8,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
        {
          binding: 9,
          resource: {
            buffer: bvhBuffer,
          },
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
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 13,
          resource: linearSampler,
        },
      ],
    });

    const arrayBuffer = new ArrayBuffer(LIGHT_BUFFER_STRIDE * lights.length);
    const lightDataView = new DataView(arrayBuffer);

    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const lightBufferOffset = i * LIGHT_BUFFER_STRIDE;
      lightDataView.setFloat32(lightBufferOffset, light.position[0], true);
      lightDataView.setFloat32(lightBufferOffset + 4, light.position[1], true);
      lightDataView.setFloat32(lightBufferOffset + 8, light.position[2], true);
      lightDataView.setFloat32(lightBufferOffset + 16, light.color[0], true);
      lightDataView.setFloat32(lightBufferOffset + 20, light.color[1], true);
      lightDataView.setFloat32(lightBufferOffset + 24, light.color[2], true);
    }
    device.queue.writeBuffer(lightBuffer, 0, arrayBuffer);

    const downscaledWidth = Math.ceil(
      outputTextures.finalTexture.width / DOWNSCALE_FACTOR,
    );
    const downscaledHeight = Math.ceil(
      outputTextures.finalTexture.height / DOWNSCALE_FACTOR,
    );

    let passWriteOffset = 0;

    let passEncoder: GPUComputePassEncoder;

    const temporalPass = () => {
      passEncoder = commandEncoder.beginComputePass({
        label: "temporal",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + passWriteOffset,
          endOfPassWriteIndex:
            timestampWrites.endOfPassWriteIndex + passWriteOffset,
        },
      });
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setPipeline(temporalPipeline);
      passEncoder.setBindGroup(1, temporalBindGroup);
      passEncoder.dispatchWorkgroups(
        Math.ceil(reservoirTexture.width / 8),
        Math.ceil(reservoirTexture.height / 8),
        1,
      );
      passEncoder.end();
      passWriteOffset += 2;
    };

    const compositePass = () => {
      passEncoder = commandEncoder.beginComputePass({
        label: "composite-pass",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + passWriteOffset,
          endOfPassWriteIndex:
            timestampWrites.endOfPassWriteIndex + passWriteOffset,
        },
      });
      passEncoder.setPipeline(compositePipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setBindGroup(1, svgfConfigBindGroup);
      passEncoder.dispatchWorkgroups(
        Math.ceil(outputTextures.finalTexture.width / 8),
        Math.ceil(outputTextures.finalTexture.height / 8),
        1,
      );
      passEncoder.end();
      passWriteOffset += 2;
    };

    const sampleLightsPass = () => {
      passEncoder = commandEncoder.beginComputePass({
        label: "sample-lights",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + passWriteOffset,
          endOfPassWriteIndex:
            timestampWrites.endOfPassWriteIndex + passWriteOffset,
        },
      });
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(1, lightConfigBindGroup);
      passEncoder.setBindGroup(2, copyReservoirBindGroup);
      passEncoder.dispatchWorkgroups(
        Math.ceil(downscaledWidth / 8),
        Math.ceil(downscaledHeight / 8),
        1,
      );

      passEncoder.end();
      passWriteOffset += 2;
    };

    const spatialPass = () => {
      passEncoder = commandEncoder.beginComputePass({
        label: "spatial-pass",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + passWriteOffset,
          endOfPassWriteIndex:
            timestampWrites.endOfPassWriteIndex + passWriteOffset,
        },
      });
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setBindGroup(1, spatialBindGroup);
      passEncoder.setPipeline(spatialPipeline);
      passEncoder.dispatchWorkgroups(
        Math.ceil(reservoirTexture.width / 8),
        Math.ceil(reservoirTexture.height / 8),
        1,
      );
      passEncoder.end();
      passWriteOffset += 2;
    };

    const copyPass = () => {
      commandEncoder.copyTextureToTexture(
        {
          texture: reservoirTexture,
        },
        {
          texture: copyReservoirTexture,
        },
        {
          width: reservoirTexture.width,
          height: reservoirTexture.height,
        },
      );
    };

    const clearReservoirPass = () => {
      passEncoder = commandEncoder.beginComputePass({
        label: "clear-reservoir-pass",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + passWriteOffset,
          endOfPassWriteIndex:
            timestampWrites.endOfPassWriteIndex + passWriteOffset,
        },
      });
      passEncoder.setPipeline(clearReservoirPipeline);
      passEncoder.setBindGroup(0, clearReservoirBindGroup);
      passEncoder.dispatchWorkgroups(
        Math.ceil(reservoirTexture.width / 8),
        Math.ceil(reservoirTexture.height / 8),
      );
      passEncoder.end();
      passWriteOffset += 2;
    };

    const denoisePass = (rate: number) => {
      device.queue.writeBuffer(atrousRateBuffer, 0, new Uint32Array([rate]));
      passEncoder = commandEncoder.beginComputePass({
        label: "denoise-pass",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + passWriteOffset,
          endOfPassWriteIndex:
            timestampWrites.endOfPassWriteIndex + passWriteOffset,
        },
      });
      passEncoder.setPipeline(denoisePipeline);
      passEncoder.setBindGroup(0, denoiseBindGroup);
      passEncoder.setBindGroup(1, svgfConfigBindGroup);
      passEncoder.dispatchWorkgroups(
        Math.ceil(lightTexture.width / 8),
        Math.ceil(lightTexture.height / 8),
        1,
      );
      passEncoder.end();
      passWriteOffset += 2;
      copyFinalTextureBack();
    };

    const variancePass = () => {
      passEncoder = commandEncoder.beginComputePass({
        label: "variance-pass",
        timestampWrites: {
          querySet: timestampWrites.querySet,
          beginningOfPassWriteIndex:
            timestampWrites.beginningOfPassWriteIndex + passWriteOffset,
          endOfPassWriteIndex:
            timestampWrites.endOfPassWriteIndex + passWriteOffset,
        },
      });
      passEncoder.setPipeline(variancePipeline);
      passEncoder.setBindGroup(0, varianceBindGroup);
      passEncoder.setBindGroup(1, gBufferBindGroup);
      passEncoder.dispatchWorkgroups(
        Math.ceil(outputTextures.finalTexture.width / 8),
        Math.ceil(outputTextures.finalTexture.height / 8),
        1,
      );
      passEncoder.end();
      passWriteOffset += 2;
      commandEncoder.copyTextureToTexture(
        { texture: varianceTexture },
        { texture: previousVarianceTexture },
        {
          width: varianceTexture.width,
          height: varianceTexture.height,
        },
      );
    };

    const copyFinalTextureBack = () => {
      commandEncoder.copyTextureToTexture(
        {
          texture: copyLightTexture,
        },
        {
          texture: lightTexture.texture,
        },
        {
          width: lightTexture.width,
          height: lightTexture.height,
        },
      );
    };

    if (passConfig.temporalEnabled) {
      temporalPass();
      copyPass();
    }
    sampleLightsPass();
    copyPass();
    if (passConfig.spatialEnabled) {
      spatialPass();
      copyPass();
    }
    compositePass();
    if (passConfig.denoiseEnabled) {
      variancePass();
      if (passConfig.maxDenoiseRate >= 2) {
        denoisePass(2);
      }
      if (passConfig.maxDenoiseRate >= 4) {
        denoisePass(4);
      }
      if (passConfig.maxDenoiseRate >= 8) {
        denoisePass(8);
      }
    }
    commandEncoder.copyTextureToTexture(
      {
        texture: reservoirTexture,
      },
      {
        texture: previousReservoirTexture,
      },
      {
        width: reservoirTexture.width,
        height: reservoirTexture.height,
      },
    );
    if (passConfig.denoiseEnabled) {
      taaSubpass.render(args);
    }

    commandEncoder.copyTextureToTexture(
      {
        texture: lightTexture.texture,
      },
      {
        texture: outputTextures.finalTexture.texture,
      },
      {
        width: lightTexture.width,
        height: lightTexture.height,
      },
    );
    clearReservoirPass();
  };

  return {
    render,
    label: "lights",
    timestampLabels: [
      "restir temporal",
      "restir lights",
      // "restir spatial",
      "restir composite",
      "svgf variance",
      // "denoise 1",
      "svgf denoise 2",
      "svgf denoise 4",
      // "svgf denoise 8",
      "svgf taa",
      "restir clear",
    ],
  };
};
