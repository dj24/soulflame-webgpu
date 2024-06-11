import { device, RenderArgs, resolution } from "../../app";
import getRayDirection from "../../shader/get-ray-direction.wgsl";
import depth from "../../shader/depth.wgsl";

export const getWorldPosReconstructionPipeline = async () => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: "unfilterable-float",
          viewDimension: "2d",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba32float",
          viewDimension: "2d",
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: "rgba16float",
          viewDimension: "2d",
        },
      },
    ],
  });

  const pipeline = await device.createComputePipelineAsync({
    label: "reconstruct world pos",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
          ${getRayDirection}
          ${depth}
          struct ViewProjectionMatrices {
            viewProjection : mat4x4<f32>,
            previousViewProjection : mat4x4<f32>,
            inverseViewProjection : mat4x4<f32>,
            projection : mat4x4<f32>,
            inverseProjection: mat4x4<f32>
          };
          
          @group(0) @binding(0) var depthTex : texture_2d<f32>;
          @group(0) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;
          @group(0) @binding(2) var worldPosTex : texture_storage_2d<rgba32float, write>;
          @group(0) @binding(3) var<uniform> cameraPosition : vec3<f32>;
          @group(0) @binding(4) var normalTex : texture_storage_2d<rgba16float, write>;
        
          const NEAR_PLANE = 0.5;
          const FAR_PLANE = 10000.0;
         
          
          @compute @workgroup_size(8, 8, 1)
          fn main(
            @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
          ) {
            let resolution = textureDimensions(worldPosTex);
            let pixel = GlobalInvocationID.xy;
            var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
            let depth = textureLoad(depthTex, pixel, 0).r;
            let distanceToSurface = reversedNormalisedDepthToDistance(depth, NEAR_PLANE, FAR_PLANE);
            let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
            var worldPos = cameraPosition + rayDirection * distanceToSurface;
            
            if(depth == 0.0) {
              worldPos = vec3<f32>(0.0, 0.0, 0.0);
            }
            
            //let normal = computeNormalImproved(vec2<i32>(pixel)); 
            //textureStore(normalTex, pixel, vec4(normal, 1));
            textureStore(worldPosTex, pixel, vec4(worldPos, 1));
          }
`,
      }),
      entryPoint: "main",
    },
  });

  const getBindGroup = (renderArgs: RenderArgs) => {
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: renderArgs.outputTextures.depthTexture.view,
        },
        {
          binding: 1,
          resource: {
            buffer: renderArgs.viewProjectionMatricesBuffer,
          },
        },
        {
          binding: 2,
          resource: renderArgs.outputTextures.worldPositionTexture.view,
        },
        {
          binding: 3,
          resource: {
            buffer: renderArgs.cameraPositionBuffer,
          },
        },
        {
          binding: 4,
          resource: renderArgs.outputTextures.normalTexture.view,
        },
      ],
    });
  };

  let bindGroup: GPUBindGroup;

  const enqueuePass = (
    computePass: GPUComputePassEncoder,
    renderArgs: RenderArgs,
  ) => {
    if (!bindGroup) {
      bindGroup = getBindGroup(renderArgs);
    }
    // Reconstruct world position
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );
  };

  return enqueuePass;
};
