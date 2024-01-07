struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>
};

@group(1) @binding(1) var voxels : texture_3d<f32>;
@group(0) @binding(3) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(5) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(6) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(7) var albedoTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(8) var depthWrite : texture_storage_2d<r32float, write>;
@group(0) @binding(9) var velocityTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(10) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(11) var depthRead : texture_3d<f32>;

fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

const FAR_PLANE = 10000.0;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  var pixel = uv * vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var rayOrigin = cameraPosition;

  let rayMarchResult = rayMarch(0, rayOrigin, rayDirection, voxelObjects);
  let colour = rayMarchResult.colour;
  let depth = distance(rayMarchResult.worldPos, cameraPosition);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(depth,0.0,0.0,0.0));
  textureStore(normalTex, GlobalInvocationID.xy, vec4(rayMarchResult.normal,1));
  textureStore(albedoTex, GlobalInvocationID.xy, vec4(colour * (1.0 - depth * 0.1),1));

  // VELOCITY
  let inverseMvp = viewProjections.viewProjection * rayMarchResult.modelMatrix ;
  let previousInverseMvp = viewProjections.previousViewProjection *  rayMarchResult.previousModelMatrix;
  let currentClipSpace = inverseMvp * vec4(rayMarchResult.worldPos, 1.0);
  let previousClipSpace = previousInverseMvp * vec4(rayMarchResult.worldPos, 1.0);
  let currentNDC = currentClipSpace.xyz / currentClipSpace.w;
  let previousNDC = previousClipSpace.xyz / previousClipSpace.w;
  let velocity = currentNDC - previousNDC;

  textureStore(velocityTex, GlobalInvocationID.xy, vec4(velocity,0));
}
