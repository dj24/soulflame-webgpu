struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(2) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(3) var voxels : texture_3d<f32>;
@group(0) @binding(4) var<storage> voxelObject : VoxelObject;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(6) var depthStore : texture_storage_2d<r32float, write>;

struct GBufferOutput {
  @location(0) albedo : vec4f,
  @location(1) normal : vec4f,
  @location(2) worldPosition : vec4f,
  @location(3) velocity : vec4f,
  @builtin(frag_depth) depth : f32,
}

fn normaliseValue(min: f32, max: f32, value: f32) -> f32 {
  return (value - min) / (max - min);
}

@fragment
fn main(
  @location(0) objectPos : vec3f,
  @builtin(front_facing) frontFacing : bool,
  @location(3) unsignedObjectNormal : vec3f
) -> GBufferOutput
 {
   var output : GBufferOutput;
   var objectNormal = unsignedObjectNormal;
    if(!frontFacing) {
      objectNormal = -objectNormal;
    }

   let voxelId = vec3<u32>(floor(objectPos + voxelObject.atlasLocation));
   let voxel = textureLoad(voxels, voxelId, 0);
   if(voxel.a == 0.0) {
     discard;
   }

   let worldPos = (voxelObject.transform * vec4(objectPos,1)).xyz;
   let near = 0.1;
   let far = 10000.0;
   let linearDepth = normaliseValue(near, far, distance(cameraPosition, worldPos));
   output.albedo = voxel;
   output.albedo = vec4(abs(objectNormal), 1.0);
   output.normal = vec4(0.0, 0.0, 1.0, 1.0);
   output.worldPosition = vec4(worldPos, 1.0);
   output.depth = linearDepth;
   return output;
}