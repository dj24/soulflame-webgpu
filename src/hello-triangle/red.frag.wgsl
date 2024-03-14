struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(2) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(3) var voxels : texture_3d<f32>;
@group(0) @binding(4) var<uniform> voxelObject : VoxelObject;

const IDENTITY_MATRIX = mat4x4<f32>(
  vec4<f32>(1.0, 0.0, 0.0, 0.0),
  vec4<f32>(0.0, 1.0, 0.0, 0.0),
  vec4<f32>(0.0, 0.0, 1.0, 0.0),
  vec4<f32>(0.0, 0.0, 0.0, 1.0)
);

@fragment
fn main(
   @location(0) worldPos : vec3f,
    @location(1) @interpolate(linear) ndc : vec3f
) -> @location(0) vec4f {
    var screenUV = ndc.xy * 0.5 + 0.5;
    var inverseViewProjection = viewProjections.inverseViewProjection;
    let rayDirection = calculateRayDirection(screenUV,inverseViewProjection);
//    var voxelObject: VoxelObject;
//
//    voxelObject.transform = IDENTITY_MATRIX;
//    voxelObject.inverseTransform = IDENTITY_MATRIX;
//    voxelObject.previousTransform = IDENTITY_MATRIX;
//    voxelObject.previousInverseTransform = IDENTITY_MATRIX;
//    voxelObject.size = vec3<f32>(128,128,64);
//    voxelObject.atlasLocation = vec3<f32>(1,0,0);

    let result = rayMarchAtMip(voxelObject, rayDirection, worldPos, 0);

//  return clipPos / 1280.0;
      return vec4(worldPos / voxelObject.size, 1);
  return vec4(abs(result.normal), 1.0);
  return vec4(f32(result.stepsTaken) * 0.01);
}