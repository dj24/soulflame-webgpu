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


const IDENTITY_MATRIX = mat4x4<f32>(
  vec4<f32>(1.0, 0.0, 0.0, 0.0),
  vec4<f32>(0.0, 1.0, 0.0, 0.0),
  vec4<f32>(0.0, 0.0, 1.0, 0.0),
  vec4<f32>(0.0, 0.0, 0.0, 1.0)
);

struct GBufferOutput {
  @location(0) albedo : vec4f,
  @location(1) normal : vec4f,
  @location(2) worldPosition : vec4f,
  @location(3) velocity : vec4f,
//  @location(4) depth : f32,
  @builtin(frag_depth) depth : f32,
}


// TODO: output depth
@fragment
fn main(

  @location(0) objectPos : vec3f,
//   @location(1) worldPos : vec3f,
    @location(2) @interpolate(linear) ndc : vec3f
) -> GBufferOutput
 {
    var output : GBufferOutput;
   output.albedo = vec4(floor(objectPos) / voxelObject.size, 1);
//    output.albedo = vec4(output.normal);
    return output;
}