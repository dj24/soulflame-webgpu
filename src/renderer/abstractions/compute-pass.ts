import { device, RenderArgs, RenderPass } from "../app";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import randomCommon from "../random-common.wgsl";
import matrices from "../shader/matrices.wgsl";
import bvh from "../shader/bvh.wgsl";
import { baseBindGroupLayoutEntries } from "./compute-composite-pass";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

const NUM_THREADS_X = 8;
const NUM_THREADS_Y = 8;

type ComputePassArgs = {
  shaderCode: string;
  entryPoint: string;
  label: string;
};

/**
 * Creates a compute pass that outputs directly to the final image.
 * @param shaderCode - The shader code containing both the effect and the composite compute kernels.
 * @param entryPoint - The name of the compute kernel that applies the effect.
 * @param label - The label to use for the compute pass.
 */
export const createComputePass = async ({
  shaderCode,
  entryPoint,
  label,
}: ComputePassArgs): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: baseBindGroupLayoutEntries,
  });

  const code = `
struct Time {
  frame: u32,
  deltaTime: f32
};

@group(0) @binding(0) var depthTex : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<${OUTPUT_TEXTURE_FORMAT}, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(7) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(8) var linearSampler : sampler;
@group(0) @binding(10) var normalTex : texture_2d<f32>;
@group(0) @binding(11) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(12) var<uniform> time : Time;
@group(0) @binding(13) var nearestSampler : sampler;
@group(0) @binding(14) var velocityAndWaterTex : texture_2d<f32>;
@group(0) @binding(16) var worldPosTex : texture_2d<f32>;
@group(0) @binding(17) var albedoTex : texture_2d<f32>;
@group(0) @binding(18) var skyCube : texture_cube<f32>;

${matrices}
${randomCommon}
${getRayDirection}
${boxIntersection}
${shaderCode}`;

  const effectPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code,
      }),
      entryPoint,
    },
  });

  let copyOutputTexture: GPUTexture;
  let copyOutputTextureView: GPUTextureView;

  let nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  let linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  let bindGroup: GPUBindGroup;

  const render = ({
    commandEncoder,
    outputTextures,
    timestampWrites,
    viewProjectionMatricesBuffer,
    volumeAtlas,
    cameraPositionBuffer,
    transformationMatrixBuffer,
    sunDirectionBuffer,
    blueNoiseTextureView,
    timeBuffer,
    bvhBuffer,
  }: RenderArgs) => {
    if (!copyOutputTexture) {
      copyOutputTexture = device.createTexture({
        size: [
          outputTextures.finalTexture.width,
          outputTextures.finalTexture.height,
          1,
        ],
        format: outputTextures.finalTexture.format,
        usage: outputTextures.finalTexture.usage,
      });
      copyOutputTextureView = copyOutputTexture.createView();
    }

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture.texture, // TODO: pass texture as well as view
      },
      {
        texture: copyOutputTexture,
      },
      {
        width: outputTextures.finalTexture.width,
        height: outputTextures.finalTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );

    if (!bindGroup) {
      const entries = [
        {
          binding: 0,
          resource: outputTextures.depthTexture.view,
        },
        {
          binding: 1,
          resource: copyOutputTextureView,
        },
        {
          binding: 2,
          resource: outputTextures.finalTexture.view,
        },
        {
          binding: 3,
          resource: {
            buffer: viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 5,
          resource: {
            buffer: cameraPositionBuffer,
          },
        },
        {
          binding: 7,
          resource: {
            buffer: sunDirectionBuffer,
          },
        },
        {
          binding: 8,
          resource: linearSampler,
        },
        {
          binding: 10,
          resource: outputTextures.normalTexture.view,
        },
        {
          binding: 11,
          resource: blueNoiseTextureView,
        },
        {
          binding: 12,
          resource: {
            buffer: timeBuffer,
          },
        },
        {
          binding: 13,
          resource: nearestSampler,
        },
        {
          binding: 14,
          resource: outputTextures.velocityTexture.view,
        },
        {
          binding: 16,
          resource: outputTextures.worldPositionTexture.view,
        },
        {
          binding: 17,
          resource: outputTextures.albedoTexture.view,
        },
        {
          binding: 18,
          resource: outputTextures.skyTexture.createView({
            dimension: "cube",
          }),
        },
      ];

      const bindGroupDescriptor: GPUBindGroupDescriptor = {
        layout: bindGroupLayout,
        entries,
      };

      bindGroup = device.createBindGroup(bindGroupDescriptor);
    }
    const computePass = commandEncoder.beginComputePass({
      timestampWrites,
    });

    // Get Effect
    computePass.setPipeline(effectPipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(outputTextures.finalTexture.width / NUM_THREADS_X),
      Math.ceil(outputTextures.finalTexture.height / NUM_THREADS_Y),
    );

    computePass.end();
  };
  return { render, label };
};
