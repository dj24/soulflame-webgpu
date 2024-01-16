@group(0) @binding(0) var outputTex : texture_storage_2d<rgba32float, write>;
@group(0) @binding(1) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(3) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
@group(0) @binding(4) var voxels : texture_3d<f32>;

fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
// TODO: pass projection in here and calcaulte ray again
//  let downscaledResolution = textureDimensions(outputTex);
//  let pixel = vec2<f32>(f32(GlobalInvocationID.x), f32(downscaledResolution.y - GlobalInvocationID.y));
//  let uv = pixel / vec2<f32>(downscaledResolution);
//  var rayOrigin = cameraPosition;
//  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
//  let rayMarchResult = rayMarch( rayOrigin, rayDirection, voxelObjects);
//  let depth = distance(rayOrigin, rayMarchResult.worldPos);
//  textureStore(outputTex, GlobalInvocationID.xy, vec4(0,0,0,depth));

}
