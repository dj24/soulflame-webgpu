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
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  var pixel = uv * vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var rayOrigin = cameraPosition;
  let startingObjectIndex = textureLoad(depthTex, GlobalInvocationID.xy,0).r;
  var sky = textureSampleLevel(skyTex, voxelsSampler, rayDirection, 0.0).rgb;

  if(startingObjectIndex < 0){
    textureStore(debugTex, GlobalInvocationID.xy, vec4(1.0));
    textureStore(albedoTex, GlobalInvocationID.xy, vec4(sky,1.0));
    textureStore(normalTex, GlobalInvocationID.xy, vec4(0));
    return;
  }

  let rayMarchResult = rayMarch(startingObjectIndex, rayOrigin, rayDirection, voxelObjects, voxelsSampler);

  var colour = rayMarchResult.colour;
  colour = abs(rayMarchResult.worldPos) %1;
  if(all(rayMarchResult.colour == vec3<f32>(0.0))){
    colour = sky;
  }

  textureStore(normalTex, GlobalInvocationID.xy, vec4(rayMarchResult.normal,1));
  textureStore(albedoTex, GlobalInvocationID.xy, vec4(colour,1));
}
