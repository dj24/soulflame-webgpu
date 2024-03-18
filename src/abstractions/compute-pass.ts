import { debugValues, device, RenderArgs, RenderPass } from "../app";
import boxIntersection from "../shader/box-intersection.wgsl";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import randomCommon from "../random-common.wgsl";
import matrices from "../shader/matrices.wgsl";
import { baseBindGroupLayoutEntries } from "./compute-composite-pass";

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
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(4) var voxels : texture_3d<f32>;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(6) var<storage> voxelObjects : array<VoxelObject>;
@group(0) @binding(7) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(8) var linearSampler : sampler;
@group(0) @binding(9) var intermediaryTexture : texture_2d<f32>;
@group(0) @binding(10) var normalTex : texture_2d<f32>;
@group(0) @binding(11) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(12) var<uniform> time : Time;
@group(0) @binding(13) var nearestSampler : sampler;
@group(0) @binding(14) var velocityAndWaterTex : texture_2d<f32>;
@group(0) @binding(15) var<storage> bvhNodes: array<BVHNode>;

const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
${matrices}
${randomCommon}
${getRayDirection}
${boxIntersection}
${raymarchVoxels}
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

  let nearestSampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  let linearSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const render = ({
    outputTextures,
    timestampWrites,
    viewProjectionMatricesBuffer,
    voxelTextureView,
    cameraPositionBuffer,
    transformationMatrixBuffer,
    sunDirectionBuffer,
    blueNoiseTexture,
    timeBuffer,
    bvhBuffer,
  }: RenderArgs) => {
    if (!copyOutputTexture) {
      copyOutputTexture = device.createTexture({
        size: [
          outputTextures.finalTexture.width,
          outputTextures.finalTexture.height,
          outputTextures.finalTexture.depthOrArrayLayers,
        ],
        format: outputTextures.finalTexture.format,
        usage: outputTextures.finalTexture.usage,
      });
    }

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.finalTexture, // TODO: pass texture as well as view
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

    const entries = [
      {
        binding: 0,
        resource: outputTextures.depthTexture.createView(),
      },
      {
        binding: 1,
        resource: copyOutputTexture.createView(),
      },
      {
        binding: 2,
        resource: outputTextures.finalTexture.createView(),
      },
      {
        binding: 3,
        resource: {
          buffer: viewProjectionMatricesBuffer,
        },
      },
      {
        binding: 4,
        resource: voxelTextureView,
      },
      {
        binding: 5,
        resource: {
          buffer: cameraPositionBuffer,
        },
      },
      {
        binding: 6,
        resource: {
          buffer: transformationMatrixBuffer,
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
        resource: outputTextures.normalTexture.createView(),
      },
      {
        binding: 11,
        resource: blueNoiseTexture.createView(),
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
        resource: outputTextures.velocityTexture.createView(),
      },
      {
        binding: 15,
        resource: {
          buffer: bvhBuffer,
        },
      },
    ];

    const bindGroupDescriptor: GPUBindGroupDescriptor = {
      layout: bindGroupLayout,
      entries,
    };

    const bindGroup = device.createBindGroup(bindGroupDescriptor);

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
    return [commandEncoder.finish()];
  };
  return { render, label };
};
