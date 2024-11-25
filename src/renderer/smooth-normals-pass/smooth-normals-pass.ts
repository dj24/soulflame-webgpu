import { RenderArgs, RenderPass } from "../app";
import smoothNormals from "./smooth-normals.wgsl";
import downscale from "./downscale.wgsl";

/** A pass responsible for smoothing the normals of the terrain to prevent aliasing.
 * It does this by creating mip levels of the normal texture and
 * blending them together based on distance
 * @param device - The GPU device
 */
export const getSmoothNormalsPass = async (
  device: GPUDevice,
): Promise<RenderPass> => {
  const samplerBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        sampler: {
          type: "filtering",
        },
      },
    ],
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      // input texture
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "float",
        },
      },
      // output texture (next mip level)
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba16float",
        },
      },
    ],
  });

  // Create mips
  const mipChainPipeline = await device.createComputePipelineAsync({
    label: "smooth normals - create mips",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<rgba16float, write>;
        ${downscale}`,
      }),
      entryPoint: "main",
    },
  });

  const smoothPipeline = await device.createComputePipelineAsync({
    label: "smooth normals - apply smoothing",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, samplerBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(0) var inputTex : texture_2d<f32>;
        @group(0) @binding(1) var outputTex : texture_storage_2d<rgba16float, write>;
        @group(1) @binding(0) var nearestSampler : sampler;
        ${smoothNormals}`,
      }),
      entryPoint: "main",
    },
  });

  let createMipBindGroups: GPUBindGroup[] = [];
  let smoothBindGroup: GPUBindGroup;
  let normalViews: GPUTextureView[] = [];
  let normalViewAllMips: GPUTextureView;
  let samplerBindGroup = device.createBindGroup({
    layout: samplerBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: device.createSampler({
          magFilter: "nearest",
          minFilter: "nearest",
          mipmapFilter: "nearest",
        }),
      },
    ],
  });

  const render = (renderArgs: RenderArgs) => {
    const { timestampWrites } = renderArgs;
    const normalMipCount =
      renderArgs.outputTextures.normalTexture.texture.mipLevelCount;

    if (normalViews.length === 0) {
      for (let i = 0; i < normalMipCount; i++) {
        normalViews.push(
          renderArgs.outputTextures.normalTexture.texture.createView({
            baseMipLevel: i,
            mipLevelCount: 1,
          }),
        );
      }
    }

    if (!normalViewAllMips) {
      normalViewAllMips =
        renderArgs.outputTextures.normalTexture.texture.createView();
    }

    if (createMipBindGroups.length === 0) {
      for (let i = 0; i < normalMipCount - 1; i++) {
        createMipBindGroups.push(
          device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
              {
                binding: 0,
                resource: normalViews[i],
              },
              {
                binding: 1,
                resource: normalViews[i + 1],
              },
            ],
          }),
        );
      }
    }

    if (!smoothBindGroup) {
      smoothBindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: normalViewAllMips,
          },
          {
            binding: 1,
            resource: renderArgs.outputTextures.finalTexture.view,
          },
        ],
      });
    }

    const resolutionX = renderArgs.outputTextures.normalTexture.width;
    const resolutionY = renderArgs.outputTextures.normalTexture.height;

    const commandEncoder = device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass({ timestampWrites });

    // Downscale into mip chain
    // computePass.setPipeline(mipChainPipeline);
    // for (let i = 0; i < createMipBindGroups.length; i++) {
    //   computePass.setBindGroup(0, createMipBindGroups[i]);
    //   const downscale = 2 ** (i + 1);
    //   console.log(i, downscale);
    //   computePass.dispatchWorkgroups(
    //     Math.ceil(resolutionX / downscale / 8),
    //     Math.ceil(resolutionY / downscale / 8),
    //   );
    // }

    // Use mip chain to smooth normals based on distance
    computePass.setPipeline(smoothPipeline);
    computePass.setBindGroup(0, smoothBindGroup);
    computePass.setBindGroup(1, samplerBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolutionX / 8),
      Math.ceil(resolutionY / 8),
    );
    computePass.end();
  };

  return {
    render,
    label: "smooth normals",
    timestampLabels: ["smooth normals"],
  };
};
