import gBufferRaymarch from "./g-buffer-raymarch.wgsl";
import gBufferRaster from "./g-buffer-raster.wgsl";
import clearPixelBuffer from "./clear-pixel-buffer.wgsl";
import pixelBufferElement from "./pixel-buffer-element.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import dragon from "../voxel-models/dragon.vxm";
import treeHouse from "../voxel-models/treehouse.vxm";

import {
  camera,
  device,
  debugValues,
  resolution,
  RenderPass,
  RenderArgs,
} from "../app";
import cornellBox from "../voxel-models/cornell.vxm";

export type OutputTextures = {
  finalTexture: GPUTexture;
  albedoTexture?: GPUTexture;
  normalTexture?: GPUTexture;
  velocityTexture?: GPUTexture;
  depthAndClusterTexture?: GPUTexture;
  debugTexture?: GPUTexture;
  skyTexture?: GPUTexture;
};

export const getGBufferPass = async (): Promise<RenderPass> => {
  const normalEntry: GPUBindGroupLayoutEntry = {
    binding: 4,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8snorm",
      viewDimension: "2d",
    },
  };

  const albedoEntry: GPUBindGroupLayoutEntry = {
    binding: 5,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "rgba8unorm",
      viewDimension: "2d",
    },
  };

  const velocityEntry: GPUBindGroupLayoutEntry = {
    binding: 7,
    visibility: GPUShaderStage.COMPUTE,
    storageTexture: {
      format: "r32float",
      viewDimension: "2d",
    },
  };

  // Layout for clearing the pixel buffer and copying it to the screen
  const utilLayout = device.createBindGroupLayout({
    entries: [
      // Resolution
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      // Pixel buffer
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba8unorm",
          viewDimension: "2d",
        },
      },
    ],
  });

  const uniformsBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
          viewDimension: "3d",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      normalEntry,
      albedoEntry,
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
        },
      },
      velocityEntry,
      {
        binding: 8,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 9,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      {
        binding: 10,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const rasterPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${pixelBufferElement}
          ${gBufferRaster}`,
      }),
      entryPoint: "projectVoxels",
    },
  });

  const rayPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${gBufferRaymarch}`,
      }),
      entryPoint: "main",
    },
  });

  const bufferTotexturePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [uniformsBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${getRayDirection}
          ${boxIntersection}
          ${raymarchVoxels}
          ${pixelBufferElement}
          ${gBufferRaster}`,
      }),
      entryPoint: "bufferToScreen",
    },
  });

  const clearBufferPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [utilLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `${pixelBufferElement}${clearPixelBuffer}`,
      }),
      entryPoint: "clearPixelBuffer",
    },
  });

  let outputBuffer = device.createBuffer({
    size: resolution[0] * resolution[1] * 16, // 4 bytes per pixel, 1 for each colour channel
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextures,
    cameraPositionBuffer,
    frustumCornerDirectionsBuffer,
    voxelTextureView,
    transformationMatrixBuffer,
    viewProjectionMatricesBuffer,
  }: RenderArgs) => {
    const computePass = commandEncoder.beginComputePass();

    const bufferSize = resolution[0] * resolution[1] * 8; // 4 bytes for colour, 4 bytes for distance

    if (bufferSize !== outputBuffer.size) {
      outputBuffer.destroy();
      outputBuffer = device.createBuffer({
        size: bufferSize, // 4 bytes per pixel, 1 for each colour channel
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });
    }

    const utilBindGroup = device.createBindGroup({
      layout: utilLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: outputBuffer,
          },
        },
        {
          binding: 2,
          resource: outputTextures.albedoTexture.createView(),
        },
      ],
    });

    const computeBindGroup = device.createBindGroup({
      layout: uniformsBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: voxelTextureView,
        },
        {
          binding: 2,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
        {
          binding: 4,
          resource: outputTextures.normalTexture.createView(),
        },
        {
          binding: 5,
          resource: outputTextures.albedoTexture.createView(),
        },
        {
          binding: 6,
          resource: outputTextures.depthAndClusterTexture.createView(),
        },
        {
          binding: 7,
          resource: outputTextures.velocityTexture.createView(),
        },
        {
          binding: 8,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 9,
          resource: {
            buffer: outputBuffer,
          },
        },
        {
          binding: 10,
          resource: {
            buffer: resolutionBuffer,
          },
        },
      ],
    });

    computePass.setPipeline(clearBufferPipeline);
    computePass.setBindGroup(0, utilBindGroup);
    computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);

    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get("mode");
    if (mode === "raymarch") {
      const workGroupsX = Math.ceil(resolution[0] / 8);
      const workGroupsY = Math.ceil(resolution[1] / 8);

      computePass.setPipeline(rayPipeline);
      computePass.setBindGroup(0, computeBindGroup);
      computePass.dispatchWorkgroups(workGroupsX, workGroupsY);
      computePass.end();
    } else {
      const workGroupsX = Math.ceil(treeHouse.size[0] / 12);
      const workGroupsY = Math.ceil(treeHouse.size[1] / 1);
      const workGroupsZ = Math.ceil(treeHouse.size[2] / 1);

      computePass.setPipeline(rasterPipeline);
      computePass.setBindGroup(0, computeBindGroup);
      computePass.dispatchWorkgroups(workGroupsX, workGroupsY, workGroupsZ);

      computePass.setPipeline(bufferTotexturePipeline);
      computePass.setBindGroup(0, computeBindGroup);
      computePass.dispatchWorkgroups(resolution[0] / 8, resolution[1] / 8);
      computePass.end();
    }

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.albedoTexture, // TODO: pass texture as well as view
      },
      {
        texture: outputTextures.finalTexture,
      },
      {
        width: outputTextures.finalTexture.width,
        height: outputTextures.finalTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );

    return commandEncoder.finish();
  };

  return { render, label: "G-Buffer" };
};
