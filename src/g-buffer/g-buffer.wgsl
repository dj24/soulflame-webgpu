@group(1) @binding(0) var voxelsSampler : sampler;
@group(1) @binding(1) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;
@group(0) @binding(3) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(5) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(6) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(7) var albedoTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(8) var depthTex : texture_storage_2d<r32float, write>;
@group(0) @binding(8) var depthTex : texture_2d<i32>;
@group(0) @binding(9) var debugTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(10) var skyTex : texture_cube<f32>;

fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = vec2(GlobalInvocationID.x, resolution.y - GlobalInvocationID.y);
  let uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var rayOrigin = cameraPosition;
  let startingObjectIndex = textureLoad(depthTex, GlobalInvocationID.xy,0).r;
  var sky = textureSampleLevel(skyTex, voxelsSampler, vec3(rayDirection.x, -rayDirection.y, rayDirection.z), 0.0).rgb;

  if(startingObjectIndex < 0){
    textureStore(debugTex, pixel, vec4(1.0));
    textureStore(albedoTex, pixel, vec4(sky,1.0));
    textureStore(normalTex, pixel, vec4(0));
    return;
  }

  let rayMarchResult = rayMarch(startingObjectIndex, rayOrigin, rayDirection, voxelObjects, voxelsSampler);

  var colour = rayMarchResult.colour;
  colour = rayMarchResult.worldPos % 1;

  if(all(rayMarchResult.colour == vec3<f32>(0.0))){
    colour = sky;
  }

  textureStore(normalTex, pixel, vec4(rayMarchResult.normal,1));
  textureStore(albedoTex, pixel, vec4(colour,1));
}
