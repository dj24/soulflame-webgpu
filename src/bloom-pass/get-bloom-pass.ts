import { device, RenderArgs, RenderPass } from "../app";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

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

  const linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  let bindGroup: GPUBindGroup;

  const enqueuePass = (args: {
    computePass: GPUComputePassEncoder;
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
  }) => {
    const { computePass } = args;
    if (!bindGroup) {
      bindGroup = device.createBindGroup({
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
            resource: linearSampler,
          },
        ],
      });
    }
    computePass.setPipeline(horizontalBlurComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.inputTexture.width / 8),
      Math.ceil(args.inputTexture.height / 8),
      1,
    );
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

  const linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  let bindGroup: GPUBindGroup;

  const enqueuePass = (args: {
    computePass: GPUComputePassEncoder;
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
  }) => {
    const { computePass } = args;
    if (!bindGroup) {
      bindGroup = device.createBindGroup({
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
            resource: linearSampler,
          },
        ],
      });
    }
    computePass.setPipeline(verticalBlurComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.inputTexture.width / 8),
      Math.ceil(args.inputTexture.height / 8),
      1,
    );
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

  const linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  let bindGroup: GPUBindGroup;

  const enqueuePass = (args: {
    computePass: GPUComputePassEncoder;
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
  }) => {
    const { computePass } = args;
    if (!bindGroup) {
      bindGroup = device.createBindGroup({
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
            resource: linearSampler,
          },
        ],
      });
    }
    computePass.setPipeline(downscaleComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    // TODO: dispatch correct number of workgroups for mip level
    computePass.dispatchWorkgroups(
      Math.ceil(args.outputTexture.width / 8),
      Math.ceil(args.outputTexture.height / 8),
      1,
    );
  };

  return enqueuePass;
};

const getAdditiveBlend = (blendAmount = 1) => {
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
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
        },
      },
    ],
  });

  const blendComputePipeline = device.createComputePipeline({
    label: "blend",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @group(0) @binding(2) var linearSampler : sampler;
        @group(0) @binding(3) var outputTexCopy : texture_2d<f32>;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
            var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(textureDimensions(outputTex));
            var total = vec4<f32>(0.0);
            for(var mip = 6; mip >= 0; mip--) {
                let mipTexelSize = 1.0 / vec2<f32>(textureDimensions(inputTex, mip));
                // TODO: understand why i need two texels offset?
                total += textureSampleLevel(inputTex, linearSampler, uv + mipTexelSize * 2, f32(mip));
            }
            total /= 7.0;
            total *= ${blendAmount};
            let current = textureLoad(outputTexCopy, GlobalInvocationID.xy, 0);
            textureStore(outputTex, GlobalInvocationID.xy, total + current);
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  const linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  let bindGroup: GPUBindGroup;

  const enqueuePass = (args: {
    computePass: GPUComputePassEncoder;
    inputTexture: GPUTexture;
    outputTexture: GPUTexture;
    inputTextureView: GPUTextureView;
    outputTextureView: GPUTextureView;
    outputTextureCopyView: GPUTextureView;
  }) => {
    const { computePass } = args;
    if (!bindGroup) {
      bindGroup = device.createBindGroup({
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
            resource: linearSampler,
          },
          {
            binding: 3,
            resource: args.outputTextureCopyView,
          },
        ],
      });
    }
    computePass.setPipeline(blendComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.outputTexture.width / 8),
      Math.ceil(args.outputTexture.height / 8),
      1,
    );
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
        
        const DOWNSCALE_FACTOR = 2;
        
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
            let gBufferPixel = vec2<i32>(GlobalInvocationID.xy) * DOWNSCALE_FACTOR;
            let bloomPixel = vec2<i32>(GlobalInvocationID.xy);
            let color = textureLoad(inputTex, gBufferPixel, 0);
            let luminance = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
            let threshold = 64.0;
            let smoothedLuminance = smoothstep(threshold - 1.0, threshold, luminance);
            let thresholded = mix(vec4<f32>(0.0), color, smoothedLuminance);
            textureStore(outputTex,bloomPixel, thresholded);
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  let outputCopyTexture: GPUTexture;
  let outputCopyView: GPUTextureView;
  let thresholdTexture: GPUTexture;
  let thresholdTextureCopy: GPUTexture;
  let thresholdTextureViews: GPUTextureView[];
  let thresholdTextureCopyViews: GPUTextureView[];
  let allMipsView: GPUTextureView;

  const horizontalBlur = getHorizontalBlur(1);
  const verticalBlur = getVerticalBlur(1);
  const downscalePass = getHalfResDownscalePass();
  const additiveBlend = getAdditiveBlend(0.5);

  let bindGroup: GPUBindGroup;

  const render = (args: RenderArgs) => {
    if (!thresholdTexture) {
      const thresholdDescriptor = {
        size: {
          width: args.outputTextures.finalTexture.width / 2,
          height: args.outputTextures.finalTexture.height / 2,
        },
        format: OUTPUT_TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
        mipLevelCount: 8,
      };
      thresholdTexture = device.createTexture(thresholdDescriptor);
      thresholdTextureCopy = device.createTexture(thresholdDescriptor);
      thresholdTextureViews = Array.from({ length: 8 }, (_, i) => {
        return thresholdTexture.createView({
          baseMipLevel: i,
          mipLevelCount: 1,
        });
      });
      thresholdTextureCopyViews = Array.from({ length: 7 }, (_, i) => {
        return thresholdTextureCopy.createView({
          baseMipLevel: i,
          mipLevelCount: 1,
        });
      });
      allMipsView = thresholdTexture.createView();
      outputCopyTexture = device.createTexture({
        label: "output copy texture",
        size: {
          width: args.outputTextures.finalTexture.width,
          height: args.outputTextures.finalTexture.height,
        },
        format: OUTPUT_TEXTURE_FORMAT,
        usage:
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.STORAGE_BINDING,
      });
      outputCopyView = outputCopyTexture.createView();
    }

    const { commandEncoder } = args;

    commandEncoder.copyTextureToTexture(
      {
        texture: args.outputTextures.finalTexture.texture,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 },
      },
      {
        texture: outputCopyTexture,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 },
      },
      {
        width: args.outputTextures.finalTexture.width,
        height: args.outputTextures.finalTexture.height,
        depthOrArrayLayers: 1,
      },
    );

    const computePass = commandEncoder.beginComputePass({
      timestampWrites: args.timestampWrites,
    });

    if (!bindGroup) {
      bindGroup = device.createBindGroup({
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
        ],
      });
    }
    computePass.setPipeline(thresholdComputePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(args.outputTextures.finalTexture.width / 8),
      Math.ceil(args.outputTextures.finalTexture.height / 8),
      1,
    );

    Array.from({ length: 7 }, (_, i) => {
      return [
        horizontalBlur({
          computePass,
          inputTexture: thresholdTexture,
          inputTextureView: thresholdTextureViews[i],
          outputTexture: thresholdTextureCopy,
          outputTextureView: thresholdTextureCopyViews[i],
        }),
        verticalBlur({
          computePass,
          inputTexture: thresholdTextureCopy,
          inputTextureView: thresholdTextureCopyViews[i],
          outputTexture: thresholdTexture,
          outputTextureView: thresholdTextureViews[i],
        }),
        downscalePass({
          computePass,
          inputTexture: thresholdTexture,
          inputTextureView: thresholdTextureViews[i],
          outputTexture: thresholdTexture,
          outputTextureView: thresholdTextureViews[i + 1],
        }),
      ];
    }).flat();

    additiveBlend({
      computePass,
      inputTexture: thresholdTexture,
      inputTextureView: allMipsView,
      outputTexture: args.outputTextures.finalTexture.texture,
      outputTextureView: args.outputTextures.finalTexture.view,
      outputTextureCopyView: outputCopyView,
    });
    computePass.end();
  };

  return {
    render,
    label: "bloom",
  };
};
