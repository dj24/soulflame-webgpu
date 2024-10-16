import { RenderArgs, RenderPass } from "../app";
import { GBufferTexture } from "../abstractions/g-buffer-texture";
export const getGapFillPass = async (
  device: GPUDevice,
  gBufferTexture: GBufferTexture,
): Promise<RenderPass> => {
  const gapFillLayout = device.createBindGroupLayout({
    entries: [
      // inputTexture
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
        },
      },
      // outputTexture
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: gBufferTexture.format,
        },
      },
    ],
  });

  const gapFillPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [gapFillLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTexture: texture_2d<f32>;
        @group(0) @binding(1) var outputTexture: texture_storage_2d<${gBufferTexture.format}, write>;
        
        const neightborOffsets: array<vec2<i32>, 8> = array<vec2<i32>, 8>(
          vec2<i32>(-1, -1),
          vec2<i32>(0, -1),
          vec2<i32>(1, -1),
          vec2<i32>(-1, 0),
          vec2<i32>(1, 0),
          vec2<i32>(-1, 1),
          vec2<i32>(0, 1),
          vec2<i32>(1, 1),
        );
        
        const NEIGHBOR_THRESHOLD: f32 = 200.0;
        
        @compute @workgroup_size(8, 8, 1)
        fn main(
            @builtin(global_invocation_id) id : vec3<u32>,
        ) {
            let centerSample = textureLoad(inputTexture, id.xy, 0);
            var neighborAverage: vec4<f32> = vec4<f32>(0.0);
            for(var i: i32 = 0; i < 8; i = i + 1) {
                let sample = textureLoad(inputTexture, vec2<i32>(id.xy) + neightborOffsets[i] ,0);
                neighborAverage += sample;
            }
            neighborAverage /= 8.0;
            
            // If the difference between the center sample and the average of the neighbors is greater than 0.1, replace the center sample with the average of the neighbors
            if(length(centerSample - neighborAverage) > NEIGHBOR_THRESHOLD) {
                textureStore(outputTexture, id.xy, neighborAverage);
            } else {
                textureStore(outputTexture, id.xy, centerSample);
            }
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  let copyTexture: GPUTexture;
  let copyTextureView: GPUTextureView;
  let bindGroup: GPUBindGroup;

  const render = ({ commandEncoder, timestampWrites }: RenderArgs) => {
    if (!copyTexture) {
      copyTexture = device.createTexture({
        label: "Copy Texture",
        size: [gBufferTexture.width, gBufferTexture.height, 1],
        format: gBufferTexture.format,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC,
      });
      copyTextureView = copyTexture.createView();
    }
    commandEncoder.copyTextureToTexture(
      {
        texture: copyTexture,
      },
      {
        texture: gBufferTexture.texture,
      },
      [gBufferTexture.width, gBufferTexture.height, 1],
    );
    if (!bindGroup) {
      bindGroup = device.createBindGroup({
        layout: gapFillLayout,
        entries: [
          {
            binding: 0,
            resource: gBufferTexture.view,
          },
          {
            binding: 1,
            resource: copyTextureView,
          },
        ],
      });
    }

    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });

    computePass.setPipeline(gapFillPipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(gBufferTexture.width / 8),
      Math.ceil(gBufferTexture.height / 8),
      1,
    );
    computePass.end();
  };

  return {
    render,
    label: "gap fill pass",
  };
};
