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
          
          fn getPos(p: vec2<i32>, depth: f32) -> vec3<f32>
          {
              let uv = vec2<f32>(p) / vec2<f32>(textureDimensions(depthTex));
              let distanceToSurface = reversedNormalisedDepthToDistance(depth, NEAR_PLANE, FAR_PLANE);
              let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
              return cameraPosition + rayDirection * distanceToSurface;
          }
          
          fn computeNormalImproved(p: vec2<i32>) -> vec3<f32>
          {
              let c0 = textureLoad(depthTex,p           ,0).r;
              let l2 = textureLoad(depthTex,p-vec2(2,0),0).r;
              let l1 = textureLoad(depthTex,p-vec2(1,0),0).r;
              let r1 = textureLoad(depthTex,p+vec2(1,0),0).r;
              let r2 = textureLoad(depthTex,p+vec2(2,0),0).r;
              let b2 = textureLoad(depthTex,p-vec2(0,2),0).r;
              let b1 = textureLoad(depthTex,p-vec2(0,1),0).r;
              let t1 = textureLoad(depthTex,p+vec2(0,1),0).r;
              let t2 = textureLoad(depthTex,p+vec2(0,2),0).r;
              
              let dl = abs(l1*l2/(2.0*l2-l1)-c0);
              let dr = abs(r1*r2/(2.0*r2-r1)-c0);
              let db = abs(b1*b2/(2.0*b2-b1)-c0);
              let dt = abs(t1*t2/(2.0*t2-t1)-c0);
              
              let ce = getPos(p,c0);
          
              let dpdx = select(-ce + getPos(p + vec2<i32>(1, 0), r1), ce - getPos(p - vec2<i32>(1, 0), l1), dl < dr);
              let dpdy = select(-ce + getPos(p + vec2<i32>(0, 1), t1), ce - getPos(p - vec2<i32>(0, 1), b1), db < dt);
          
              return normalize(cross(dpdx,dpdy));
          }
          
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
            let worldPos = cameraPosition + rayDirection * distanceToSurface;
            
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
