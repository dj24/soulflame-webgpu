import { debugValues, device, RenderArgs, RenderPass } from "../app";
import volumetricFog from "./volumetric-fog.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import randomCommon from "../random-common.wgsl";

export const getVolumetricFog = async (): Promise<RenderPass> => {
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
      format: "rgba8unorm",
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

  const fogTextureEntry: GPUBindGroupLayoutEntry = {
    binding: 9,
    visibility: GPUShaderStage.COMPUTE,
    texture: {
      sampleType: "float",
    },
  };

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      depthEntry,
      inputTextureEntry,
      outputTextureEntry,
      matricesEntry,
      voxelsEntry,
      cameraPositionEntry,
      voxelObjectsEntry,
      sunDirectionEntry,
      linearSamplerEntry,
    ],
  });

  const blurBindGroupLayout = device.createBindGroupLayout({
    entries: [
      depthEntry,
      inputTextureEntry,
      outputTextureEntry,
      matricesEntry,
      voxelsEntry,
      cameraPositionEntry,
      voxelObjectsEntry,
      sunDirectionEntry,
      linearSamplerEntry,
      fogTextureEntry,
    ],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${randomCommon}
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${volumetricFog}`,
      }),
      entryPoint: "main",
    },
  });

  const computeBlurPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [blurBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${randomCommon}
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${volumetricFog}`,
      }),
      entryPoint: "blur",
    },
  });

  let copyOutputTexture: GPUTexture;
  let fogTexture: GPUTexture;
  const FOG_DOWNSCALE = 8;

  const render = ({
    outputTextures,
    timestampWrites,
    viewProjectionMatricesBuffer,
    voxelTextureView,
    cameraPositionBuffer,
    transformationMatrixBuffer,
    sunDirectionBuffer,
  }: RenderArgs) => {
    if (!copyOutputTexture) {
      copyOutputTexture = device.createTexture({
        size: [
          outputTextures.finalTexture.width,
          outputTextures.finalTexture.height,
          outputTextures.finalTexture.depthOrArrayLayers,
        ],
        format: outputTextures.finalTexture.format,
        usage: outputTextures.finalTexture.usage,
      });
    }
    if (!fogTexture) {
      fogTexture = device.createTexture({
        size: [
          outputTextures.finalTexture.width / FOG_DOWNSCALE,
          outputTextures.finalTexture.height / FOG_DOWNSCALE,
          outputTextures.finalTexture.depthOrArrayLayers,
        ],
        format: outputTextures.finalTexture.format,
        usage:
          GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
    }
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture, // TODO: pass texture as well as view
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

    const bindGroupDescriptor: GPUBindGroupDescriptor = {
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 1,
          resource: copyOutputTexture.createView(),
        },
        {
          binding: 2,
          resource: fogTexture.createView(),
        },
        {
          binding: 3,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 4,
          resource: voxelTextureView,
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
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
      ],
    };

    const blurBindGroupDescriptor: GPUBindGroupDescriptor = {
      layout: blurBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 1,
          resource: copyOutputTexture.createView(),
        },
        {
          binding: 2,
          resource: outputTextures.finalTexture.createView(),
        },
        {
          binding: 3,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 4,
          resource: voxelTextureView,
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
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
        {
          binding: 9,
          resource: fogTexture.createView(),
        },
      ],
    };

    const bindGroup = device.createBindGroup(bindGroupDescriptor);
    const blurBindGroup = device.createBindGroup(blurBindGroupDescriptor);

    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });

    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    const workgroupsX = Math.ceil(
      outputTextures.depthAndClusterTexture.width / 8 / FOG_DOWNSCALE,
    );
    const workgroupsY = Math.ceil(
      outputTextures.depthAndClusterTexture.height / 8 / FOG_DOWNSCALE,
    );
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);

    computePass.setPipeline(computeBlurPipeline);
    computePass.setBindGroup(0, blurBindGroup);
    const blurWorkgroupsX = Math.ceil(
      outputTextures.depthAndClusterTexture.width / 8,
    );
    const blurWorkgroupsY = Math.ceil(
      outputTextures.depthAndClusterTexture.height / 8,
    );
    computePass.dispatchWorkgroups(blurWorkgroupsX, blurWorkgroupsY);

    computePass.end();

    return [commandEncoder.finish()];
  };
  return { render, label: "volumetric fog" };
};
