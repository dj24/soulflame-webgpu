import { device } from "../../app";

export const getDivideWorkgroupCount = async () => {
  const divideWorkgroupCount = await device.createComputePipelineAsync({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          @group(0) @binding(0) var<storage, read_write> indirectArgs : array<atomic<u32>>;
          @compute @workgroup_size(1, 1, 1)
          fn main(){
            let currentCount = atomicLoad(&indirectArgs[0]);
            let newCount = currentCount / 64;
            atomicStore(&indirectArgs[0], newCount);
          }
        `,
      }),
      entryPoint: "main",
    },
  });

  let bindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    indirectArgsBuffer: GPUBuffer,
  ) => {
    if (!bindGroup) {
      bindGroup = device.createBindGroup({
        layout: divideWorkgroupCount.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: indirectArgsBuffer,
            },
          },
        ],
      });
    }
    computePass.setPipeline(divideWorkgroupCount);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(1);
  };

  return enqueuePass;
};
