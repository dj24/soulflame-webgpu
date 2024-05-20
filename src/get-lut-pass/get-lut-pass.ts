import { device, RenderArgs, RenderPass } from "../app";
import { importCubeLut } from "./import-cube-lut";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

export const getLutPass = async (path: string): Promise<RenderPass> => {
  const lutVolume = await importCubeLut(device, path);
  const lutVolumeView = lutVolume.createView();
  let copyTexture: GPUTexture;
  let copyTextureView: GPUTextureView;

  const bindGroupLayout = device.createBindGroupLayout({
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
          viewDimension: "2d",
        },
      },
    ],
  });

  const computePipeline = device.createComputePipeline({
    label: "horizontal blur",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var lutTex : texture_3d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
        @group(0) @binding(2) var linearSampler : sampler;
        @group(0) @binding(3) var inputTex : texture_2d<f32>;
        @compute @workgroup_size(8, 8, 1)
        fn main(
          @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
        ) {
           let pixel = GlobalInvocationID.xy;
           let inputColour = textureLoad(inputTex, pixel, 0);
           // x = r, y = b, z = g
           let lutUV = vec3<f32>(inputColour.r, inputColour.b, inputColour.g);
           var lutColour = textureSampleLevel(lutTex, linearSampler, lutUV, 0).rgb;
           let strength = 0.5;
           lutColour = mix(inputColour.rgb, lutColour, strength);
           textureStore(outputTex, GlobalInvocationID.xy, vec4(lutColour, 1.));
        }
        `,
      }),
      entryPoint: "main",
    },
  });

  const linearSampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
  });

  const render = ({ commandEncoder, outputTextures }: RenderArgs) => {
    if (!copyTexture) {
      copyTexture = device.createTexture({
        size: {
          width: outputTextures.finalTexture.width,
          height: outputTextures.finalTexture.height,
        },
        format: OUTPUT_TEXTURE_FORMAT,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      copyTextureView = copyTexture.createView();
    }
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture.texture, // TODO: pass texture as well as view
      },
      {
        texture: copyTexture,
      },
      {
        width: copyTexture.width,
        height: copyTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: lutVolumeView,
        },
        {
          binding: 1,
          resource: outputTextures.finalTexture.view,
        },
        {
          binding: 2,
          resource: linearSampler,
        },
        {
          binding: 3,
          resource: copyTextureView,
        },
      ],
    });

    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(
      outputTextures.finalTexture.width / 8,
      outputTextures.finalTexture.height / 8,
      1,
    );
    passEncoder.end();
  };

  return {
    render,
    label: "LUT",
  };
};
