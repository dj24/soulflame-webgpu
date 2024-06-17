import { device, RenderArgs } from "../../app";
import { baseBindGroupLayoutEntries, shadowCode } from "../get-shadows-pass";

export const getBufferPass = async () => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: baseBindGroupLayoutEntries,
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

  let rayBindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    bindGroup: GPUBindGroup,
    renderArgs: RenderArgs,
    rayGroupBuffer: GPUBuffer,
    indirectBuffer: GPUBuffer,
  ) => {
    if (!rayBindGroup) {
      rayBindGroup = getRayBindGroup(rayGroupBuffer);
    }
    // Raymarch the scene
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.setBindGroup(1, rayBindGroup);
    computePass.dispatchWorkgroups(3000);
    // computePass.dispatchWorkgroupsIndirect(indirectBuffer, 0);
  };

  return enqueuePass;
};
