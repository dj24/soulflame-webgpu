import { device, RenderArgs, RenderPass } from "../app";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";
import { quat } from "wgpu-matrix";

/** Applies a horizontal blur to the input texture
 * @param radius The radius of the blur
 * @returns A function that takes an input texture and an output texture and returns a command buffer that applies the horizontal blur
 **/
const getHorizontalBlur = (radius: number) => {
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
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {},
      },
    ],
  });

  const horizontalBlurComputePipeline = device.createComputePipeline({
    label: "horizontal blur",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @group(0) @binding(2) var linearSampler : sampler;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
            var sum = vec4<f32>(0.0);
            let uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(textureDimensions(inputTex));
            for(var i = -${radius}; i <= ${radius}; i++) {
                let offset = vec2<f32>(f32(i) / f32(textureDimensions(inputTex).x), 0.0);
                sum += textureSampleLevel(inputTex, linearSampler, uv + offset, 0.0);
            }
            textureStore(outputTex, GlobalInvocationID.xy, sum / f32(${radius * 2 + 1}));
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  const enqueuePass = (args: {
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
  }) => {
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: args.inputTextureView,
        },
        {
          binding: 1,
          resource: args.outputTextureView,
        },
        {
          binding: 2,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
      ],
    });
    computePass.setPipeline(horizontalBlurComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.inputTexture.width / 8),
      Math.ceil(args.inputTexture.height / 8),
      1,
    );
    computePass.end();
    return commandEncoder.finish();
  };

  return enqueuePass;
};

const getVerticalBlur = (radius: number) => {
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
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {},
      },
    ],
  });

  const verticalBlurComputePipeline = device.createComputePipeline({
    label: "vertical blur",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @group(0) @binding(2) var linearSampler : sampler;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
           var sum = vec4<f32>(0.0);
            let uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(textureDimensions(inputTex));
            for(var i = -${radius}; i <= ${radius}; i++) {
                let offset = vec2<f32>(0.0, f32(i) / f32(textureDimensions(inputTex).x) );
                sum += textureSampleLevel(inputTex, linearSampler, uv + offset, 0.0);
            }
            textureStore(outputTex, GlobalInvocationID.xy, sum / f32(${radius * 2 + 1}));
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  const enqueuePass = (args: {
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
  }) => {
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: args.inputTextureView,
        },
        {
          binding: 1,
          resource: args.outputTextureView,
        },
        {
          binding: 2,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
      ],
    });
    computePass.setPipeline(verticalBlurComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.inputTexture.width / 8),
      Math.ceil(args.inputTexture.height / 8),
      1,
    );
    computePass.end();
    return commandEncoder.finish();
  };

  return enqueuePass;
};

const getHalfResDownscalePass = () => {
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
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {},
      },
    ],
  });

  const downscaleComputePipeline = device.createComputePipeline({
    label: "downscale",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @group(0) @binding(2) var linearSampler : sampler;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
            var sum = vec4<f32>(0.0);
            let pixel = vec2<i32>(GlobalInvocationID.xy) * 2;
            for(var i = 0; i < 2; i++) {
                for(var j = 0; j < 2; j++) {
                    sum += textureLoad(inputTex, vec2<i32>(pixel + vec2(i, j)), 0);
                }
            }
            textureStore(outputTex, GlobalInvocationID.xy, sum / 4.0);
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  const enqueuePass = (args: {
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
  }) => {
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: args.inputTextureView,
        },
        {
          binding: 1,
          resource: args.outputTextureView,
        },
        {
          binding: 2,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
      ],
    });
    computePass.setPipeline(downscaleComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    // TODO: dispatch correct number of workgroups for mip level
    computePass.dispatchWorkgroups(
      Math.ceil(args.outputTexture.width / 8),
      Math.ceil(args.outputTexture.height / 8),
      1,
    );
    computePass.end();
    return commandEncoder.finish();
  };

  return enqueuePass;
};

const getDoubleResUpscalePass = () => {
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
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {},
      },
    ],
  });

  const upscaleComputePipeline = device.createComputePipeline({
    label: "upscale",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @group(0) @binding(2) var linearSampler : sampler;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
            var sum = vec4<f32>(0.0);
            let pixel = vec2<i32>(GlobalInvocationID.xy) / 2;
            for(var i = 0; i < 2; i++) {
                for(var j = 0; j < 2; j++) {
                    sum += textureLoad(inputTex, vec2<i32>(pixel + vec2(i, j)), 0);
                }
            }
            textureStore(outputTex, GlobalInvocationID.xy, sum);
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  const enqueuePass = (args: {
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
  }) => {
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass();
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: args.inputTextureView,
        },
        {
          binding: 1,
          resource: args.outputTextureView,
        },
        {
          binding: 2,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
      ],
    });
    computePass.setPipeline(upscaleComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.outputTexture.width / 8),
      Math.ceil(args.outputTexture.height / 8),
      1,
    );
    computePass.end();
    return commandEncoder.finish();
  };
  return enqueuePass;
};

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
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
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
        @group(0) @binding(2) var depthTex : texture_2d<f32>;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
            let color = textureLoad(inputTex, vec2<i32>(GlobalInvocationID.xy), 0);
            let depth = textureLoad(depthTex, vec2<i32>(GlobalInvocationID.xy), 0).r;
            if(depth > 0.999) {
              textureStore(outputTex, GlobalInvocationID.xy, vec4<f32>(0.0));
              return;
            }
            let luminance = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
           
            let threshold = 6.0;
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
  let thresholdTextureCopy: GPUTexture;
  let thresholdTextureViews: GPUTextureView[];
  let thresholdTextureCopyViews: GPUTextureView[];

  const horizontalBlur = getHorizontalBlur(8);
  const verticalBlur = getVerticalBlur(8);
  const downscalePass = getHalfResDownscalePass();
  const upscalePass = getDoubleResUpscalePass();

  const render = (args: RenderArgs) => {
    if (!thresholdTexture) {
      thresholdTexture = device.createTexture({
        size: {
          width: args.outputTextures.finalTexture.width,
          height: args.outputTextures.finalTexture.height,
        },
        format: OUTPUT_TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
        mipLevelCount: 8,
      });
      thresholdTextureCopy = device.createTexture({
        size: {
          width: args.outputTextures.finalTexture.width,
          height: args.outputTextures.finalTexture.height,
        },
        format: OUTPUT_TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
        mipLevelCount: 8,
      });
      thresholdTextureViews = Array.from({ length: 8 }, (_, i) => {
        return thresholdTexture.createView({
          baseMipLevel: i,
          mipLevelCount: 1,
        });
      });
      thresholdTextureCopyViews = Array.from({ length: 8 }, (_, i) => {
        return thresholdTextureCopy.createView({
          baseMipLevel: i,
          mipLevelCount: 1,
        });
      });
    }
    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass({
      timestampWrites: args.timestampWrites,
    });
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: args.outputTextures.finalTexture.view,
        },
        {
          binding: 1,
          resource: thresholdTextureViews[0],
        },
        {
          binding: 2,
          resource: args.outputTextures.depthTexture.view,
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

    return [
      commandEncoder.finish(),
      horizontalBlur({
        inputTexture: thresholdTexture,
        inputTextureView: thresholdTextureViews[0],
        outputTexture: thresholdTextureCopy,
        outputTextureView: thresholdTextureCopyViews[0],
      }),
      verticalBlur({
        inputTexture: thresholdTextureCopy,
        inputTextureView: thresholdTextureCopyViews[0],
        outputTexture: thresholdTexture,
        outputTextureView: thresholdTextureViews[0],
      }),
      downscalePass({
        inputTexture: thresholdTexture,
        inputTextureView: thresholdTextureViews[0],
        outputTexture: thresholdTexture,
        outputTextureView: thresholdTextureViews[1],
      }),
      upscalePass({
        inputTexture: thresholdTexture,
        inputTextureView: thresholdTextureViews[1],
        outputTexture: args.outputTextures.finalTexture.texture,
        outputTextureView: args.outputTextures.finalTexture.view,
      }),
    ];
  };

  return {
    render,
    label: "bloom",
  };
};
