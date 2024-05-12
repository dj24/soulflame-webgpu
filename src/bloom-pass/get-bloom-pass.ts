import { device, RenderArgs, RenderPass } from "../app";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

export const getBloomPass = async (): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
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

  const thresholdComputePipeline = device.createComputePipeline({
    label: "bloom threshold",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
            let color = textureLoad(inputTex, vec2<i32>(GlobalInvocationID.xy), 0);
            let luminance = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
            
            let threshold = 12.0;
            let smoothedLuminance = smoothstep(threshold - 1.0, threshold, luminance);
            let thresholded = mix(vec4<f32>(0.0), color, smoothedLuminance);
            textureStore(outputTex, GlobalInvocationID.xy, thresholded);
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  let thresholdTexture: GPUTexture;
  let thresholdTextureView: GPUTextureView;

  const render = (args: RenderArgs) => {
    if (!thresholdTexture) {
      thresholdTexture = device.createTexture({
        size: {
          width: args.outputTextures.finalTexture.width,
          height: args.outputTextures.finalTexture.height,
        },
        format: OUTPUT_TEXTURE_FORMAT,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
      });
      thresholdTextureView = thresholdTexture.createView();
    }
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: args.outputTextures.finalTexture.view,
        },
        {
          binding: 1,
          resource: thresholdTextureView,
        },
      ],
    });
    computePass.setPipeline(thresholdComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.outputTextures.finalTexture.width / 8),
      Math.ceil(args.outputTextures.finalTexture.height / 8),
      1,
    );
    computePass.end();

    commandEncoder.copyTextureToTexture(
      {
        texture: thresholdTexture,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 },
      },
      {
        texture: args.outputTextures.finalTexture.texture,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 },
      },
      {
        width: args.outputTextures.finalTexture.width,
        height: args.outputTextures.finalTexture.height,
        depthOrArrayLayers: 1,
      },
    );

    return [commandEncoder.finish()];
  };

  return {
    render,
    label: "bloom",
  };
};
