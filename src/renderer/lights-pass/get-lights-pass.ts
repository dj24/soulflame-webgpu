import { RenderArgs, RenderPass } from "../app";
import { Vec3 } from "wgpu-matrix";
import lightsCompute from "./lights.compute.wgsl";
import restirSpatial from "./restir-spatial.compute.wgsl";
import restirTemporal from "./restir-temporal.compute.wgsl";
import lightsComposite from "./lights-composite.compute.wgsl";
import bvh from "../shader/bvh.wgsl";
import randomCommon from "../random-common.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";

export type Light = {
  position: [number, number, number];
  size: number;
  color: [number, number, number] | Vec3;
};

const LIGHT_BUFFER_STRIDE = 32;
const DOWNSCALE_FACTOR = 3;
const RESERVOIR_DECAY = 0.5;
const MAX_SAMPLES = 128;

export const getLightsPass = async (device: GPUDevice): Promise<RenderPass> => {
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
      // Pixel buffer
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
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
      // Previous light buffer
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Depth texture
      {
        binding: 2,
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
      // Copy light buffer
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
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
      //Depth texture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout, lightConfigBindGroupLayout],
  });

  const spatialPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout, spatialBindGroupLayout],
  });

  const compositePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout, svgfConfigBindGroupLayout],
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

  const pipeline = device.createComputePipeline({
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint: "main",
    },
    layout: pipelineLayout,
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
    layout: compositePipelineLayout,
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
    layout: spatialPipelineLayout,
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

  const nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
    mipmapFilter: "nearest",
  });

  let lightBuffer: GPUBuffer;
  let bindGroup: GPUBindGroup;
  let lightConfigBindGroup: GPUBindGroup;
  let lightPixelBuffer: GPUBuffer;
  let previousLightPixelBuffer: GPUBuffer;
  let copyLightPixelBuffer: GPUBuffer;
  let lightConfigBuffer: GPUBuffer;
  let copyFinalTexture: GPUTexture;
  let copyFinalTextureView: GPUTextureView;
  let temporalBindGroup: GPUBindGroup;
  let spatialBindGroup: GPUBindGroup;
  let svgfConfigBuffer: GPUBuffer;
  let svgfConfigBindGroup: GPUBindGroup;

  let lightConfig = {
    constantAttenuation: 0.1,
    linearAttenuation: 0.2,
    quadraticAttenuation: 0.05,
  };

  let svgfConfig = {
    normalSigma: 0.6,
    depthSigma: 0.8,
    blueNoiseSCale: 0,
    spatialSigma: 3,
  };

  let passConfig = {
    spatialEnabled: false,
    temporalEnabled: false,
  };

  const folder = (window as any).debugUI.gui.addFolder("lighting");
  folder.add(lightConfig, "constantAttenuation", 0, 1.0, 0.1);
  folder.add(lightConfig, "linearAttenuation", 0.01, 1, 0.01);
  folder.add(lightConfig, "quadraticAttenuation", 0.005, 0.1, 0.001);
  folder.add(svgfConfig, "normalSigma", 0.1, 2, 0.05);
  folder.add(svgfConfig, "depthSigma", 0.1, 8, 0.05);
  folder.add(svgfConfig, "spatialSigma", 0.5, 4, 0.1);
  folder.add(svgfConfig, "blueNoiseSCale", 0, 10, 0.1);
  folder.add(passConfig, "spatialEnabled");
  folder.add(passConfig, "temporalEnabled");

  const render = ({
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
  }: RenderArgs) => {
    if (
      !copyFinalTexture ||
      copyFinalTexture.width !== outputTextures.finalTexture.width ||
      copyFinalTexture.height !== outputTextures.finalTexture.height
    ) {
      copyFinalTexture = device.createTexture({
        size: {
          width: outputTextures.finalTexture.width,
          height: outputTextures.finalTexture.height,
        },
        format: outputTextures.finalTexture.format,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      copyFinalTextureView = copyFinalTexture.createView();
    }
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture.texture,
      },
      {
        texture: copyFinalTexture,
      },
      {
        width: outputTextures.finalTexture.width,
        height: outputTextures.finalTexture.height,
      },
    );

    if (!svgfConfigBuffer) {
      svgfConfigBuffer = device.createBuffer({
        label: "svgf-config-buffer",
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(
      svgfConfigBuffer,
      0,
      new Float32Array([
        svgfConfig.normalSigma,
        svgfConfig.depthSigma,
        svgfConfig.blueNoiseSCale,
        svgfConfig.spatialSigma,
      ]),
    );

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
            resource: outputTextures.depthTexture.view,
          },
        ],
      });
    }

    // TODO: account for resolution changes
    if (!lightPixelBuffer) {
      const downscaledWidth = Math.ceil(
        outputTextures.finalTexture.width / DOWNSCALE_FACTOR,
      );
      const downscaledHeight = Math.ceil(
        outputTextures.finalTexture.height / DOWNSCALE_FACTOR,
      );
      const stride = 32;
      lightPixelBuffer = device.createBuffer({
        label: "light-pixel-buffer",
        size: stride * downscaledWidth * downscaledHeight,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    }

    if (!previousLightPixelBuffer) {
      previousLightPixelBuffer = device.createBuffer({
        label: "light-pixel-buffer",
        size: lightPixelBuffer.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

    if (!copyLightPixelBuffer) {
      copyLightPixelBuffer = device.createBuffer({
        label: "light-pixel-buffer",
        size: lightPixelBuffer.size,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
    device.queue.writeBuffer(
      lightConfigBuffer,
      0,
      new Float32Array([
        lightConfig.constantAttenuation,
        lightConfig.linearAttenuation,
        lightConfig.quadraticAttenuation,
      ]),
    );

    if (!lightBuffer) {
      lightBuffer = device.createBuffer({
        size: LIGHT_BUFFER_STRIDE * lights.length,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }

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
          resource: outputTextures.finalTexture.view,
        },
        {
          binding: 5,
          resource: {
            buffer: lightPixelBuffer,
          },
        },
        {
          binding: 6,
          resource: copyFinalTextureView,
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
      ],
    });

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
            resource: {
              buffer: previousLightPixelBuffer,
            },
          },
          {
            binding: 2,
            resource: outputTextures.depthTexture.view,
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
            resource: {
              buffer: copyLightPixelBuffer,
            },
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
        Math.ceil(downscaledWidth / 8),
        Math.ceil(downscaledHeight / 8),
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
        Math.ceil(downscaledWidth / 8),
        Math.ceil(downscaledHeight / 8),
        1,
      );
      passEncoder.end();
      passWriteOffset += 2;
    };

    const copyPass = () => {
      commandEncoder.copyBufferToBuffer(
        lightPixelBuffer,
        0,
        copyLightPixelBuffer,
        0,
        lightPixelBuffer.size,
      );
    };

    sampleLightsPass();
    if (passConfig.temporalEnabled) {
      temporalPass();
    }
    copyPass();
    if (passConfig.spatialEnabled) {
      spatialPass();
    }
    compositePass();
    commandEncoder.copyBufferToBuffer(
      lightPixelBuffer,
      0,
      previousLightPixelBuffer,
      0,
      lightPixelBuffer.size,
    );
    commandEncoder.clearBuffer(lightPixelBuffer, 0, lightPixelBuffer.size);
    commandEncoder.clearBuffer(
      copyLightPixelBuffer,
      0,
      copyLightPixelBuffer.size,
    );
  };

  return {
    render,
    label: "lights",
    timestampLabels: [
      "restir lights",
      "restir temporal",
      "restir spatial",
      "restir composite",
    ],
  };
};
