struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(1) var depth : texture_2d<f32>;
@group(0) @binding(2) var normals : texture_2d<f32>;
@group(0) @binding(3) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(5) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(6) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>;
//@group(0) @binding(7) var<uniform> resolution : vec2<u32>;

const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,1.0);
const SHADOW_ACNE_OFFSET: f32 = 0.0005;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(depth);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  let pixel = GlobalInvocationID.xy;
  var normalSample = textureLoad(normals, pixel, 0).rgb;
  let angleToSun = dot(normalSample, -SUN_DIRECTION);
  let randomCo = uv;
  let scatterAmount = 0.2;
  let shadowRayDirection = -SUN_DIRECTION + randomInHemisphere(randomCo, -SUN_DIRECTION) * scatterAmount;
//  let shadowRayDirection = -SUN_DIRECTION;
  let worldPos = textureLoad(depth, pixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
  var output = RayMarchResult();
  let voxelObject = voxelObjects[0];
  var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(worldPos, 1.0)).xyz;
  let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(shadowRayDirection, 0.0)).xyz;
  output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
  if(output.hit){
    textureStore(outputTex, pixel, vec4(0.0));
  }
}