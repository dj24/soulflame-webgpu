import { device, RenderArgs } from "../../app";
import { baseBindGroupLayoutEntries, shadowCode } from "../get-shadows-pass";

export const getBufferPass = async () => {
  const entries = [...baseBindGroupLayoutEntries];
  entries.pop();

  const bindGroupLayout = device.createBindGroupLayout({
    entries,
  });

  const rayBindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Ray buffer
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  const pipeline = device.createComputePipeline({
    label: "diffuse - indirect",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, rayBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: shadowCode,
      }),
      entryPoint: "bufferMarch",
    },
  });

  const getRayBindGroup = (screenRaysBuffer: GPUBuffer) => {
    return device.createBindGroup({
      layout: rayBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: screenRaysBuffer,
          },
        },
      ],
    });
  };

  let bindGroup: GPUBindGroup;
  let rayBindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    rayGroupBuffer: GPUBuffer,
    indirectBuffer: GPUBuffer,
    outputTextureView: GPUTextureView,
    copyOutputTextureView: GPUTextureView,
    renderArgs: RenderArgs,
  ) => {
    if (!rayBindGroup) {
      rayBindGroup = getRayBindGroup(rayGroupBuffer);
      const entries: GPUBindGroupEntry[] = [
        {
          binding: 0,
          resource: renderArgs.outputTextures.depthTexture.view,
        },
        {
          binding: 1,
          resource: copyOutputTextureView,
        },
        {
          binding: 2, // output texture
          resource: outputTextureView,
        },
        {
          binding: 3,
          resource: {
            buffer: renderArgs.viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 4,
          resource: renderArgs.volumeAtlas.atlasTextureView,
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
            buffer: renderArgs.transformationMatrixBuffer,
          },
        },
        {
          binding: 7,
          resource: {
            buffer: renderArgs.sunDirectionBuffer,
          },
        },
        {
          binding: 8,
          resource: renderArgs.linearSampler,
        },
        {
          binding: 10,
          resource: renderArgs.outputTextures.normalTexture.view,
        },
        {
          binding: 11,
          resource: renderArgs.blueNoiseTextureView,
        },
        {
          binding: 12,
          resource: {
            buffer: renderArgs.timeBuffer,
          },
        },
        {
          binding: 13,
          resource: renderArgs.nearestSampler,
        },
        {
          binding: 14,
          resource: renderArgs.outputTextures.velocityTexture.view,
        },
        {
          binding: 15,
          resource: {
            buffer: renderArgs.bvhBuffer,
          },
        },
        {
          binding: 16,
          resource: renderArgs.outputTextures.worldPositionTexture.view,
        },
        {
          binding: 17,
          resource: renderArgs.outputTextures.albedoTexture.view,
        },
        {
          binding: 18,
          resource: renderArgs.outputTextures.skyTexture.createView({
            dimension: "cube",
          }),
        },
      ];
      bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries,
      });
    }
    // Raymarch the scene
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.setBindGroup(1, rayBindGroup);
    // computePass.dispatchWorkgroups(20000);
    computePass.dispatchWorkgroupsIndirect(indirectBuffer, 0);
  };

  return enqueuePass;
};
