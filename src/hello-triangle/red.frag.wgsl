struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
@group(0) @binding(2) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(3) var voxels : texture_3d<f32>;

const IDENTITY_MATRIX = mat4x4<f32>(
  vec4<f32>(1.0, 0.0, 0.0, 0.0),
  vec4<f32>(0.0, 1.0, 0.0, 0.0),
  vec4<f32>(0.0, 0.0, 1.0, 0.0),
  vec4<f32>(0.0, 0.0, 0.0, 1.0)
);
//
//  transform: mat4x4<f32>,
//      inverseTransform: mat4x4<f32>,
//      previousTransform: mat4x4<f32>,
//      previousInverseTransform: mat4x4<f32>,
//      size : vec3<f32>,
//      atlasLocation : vec3<f32>,

@fragment
fn main(
   @builtin(position) clipPos: vec4f,
   @location(0) worldPos : vec3f,
    @location(1)  @interpolate(linear) ndc : vec3<f32>
) -> @location(0) vec4f {
    let screenUV = ndc.xy * 0.5 + 0.5;
    let rayDirection = calculateRayDirection(screenUV,viewProjections.inverseViewProjection);
    var voxelObject: VoxelObject;

    voxelObject.transform = IDENTITY_MATRIX;
    voxelObject.inverseTransform = IDENTITY_MATRIX;
    voxelObject.previousTransform = IDENTITY_MATRIX;
    voxelObject.previousInverseTransform = IDENTITY_MATRIX;
    voxelObject.size = vec3<f32>(128,128,64);
    voxelObject.atlasLocation = vec3<f32>(1,0,0);

    let result = rayMarchAtMip(voxelObject, rayDirection, worldPos, 0);

//return vec4(screenUV,0, 1);
//    return vec4(rayDirection, 1);
return vec4(f32(result.stepsTaken) * 0.01);
}