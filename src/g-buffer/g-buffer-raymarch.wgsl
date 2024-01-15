struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(3) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(6) var depthRead : texture_2d<f32>;
@group(0) @binding(6) var depthWrite : texture_storage_2d<r32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<rg32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
//@group(0) @binding(10) var<uniform> resolution : vec2<u32>;


fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

fn getVelocity(rayMarchResult: RayMarchResult, viewProjections: ViewProjectionMatrices) -> vec3<f32> {
  let objectSpace = rayMarchResult.inverseModelMatrix * vec4(rayMarchResult.worldPos, 1.0);
  let previousObjectSpace = rayMarchResult.previousInverseModelMatrix * vec4(rayMarchResult.worldPos, 1.0);

  let mvp = viewProjections.viewProjection * rayMarchResult.modelMatrix;
  let previousMvp = viewProjections.previousViewProjection * rayMarchResult.previousModelMatrix;

  let objectClipSpace = mvp * vec4(objectSpace.xyz, 1.0);
  let previousObjectClipSpace = previousMvp * vec4(objectSpace.xyz, 1.0);

  let objectNDC = objectClipSpace.xyz / objectClipSpace.w;
  let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

  var velocity = objectNDC - previousObjectNDC;
  velocity.y = -velocity.y;
  return velocity;
}

const FAR_PLANE = 10000.0;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
//  let initialDepth = textureLoad(depthRead, vec2<i32>(GlobalInvocationID.xy), 0).r;
//  if(initialDepth > 10000) {
//    textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
//    textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));
//    return;
//  }

  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  var pixel = GlobalInvocationID.xy;

  var rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);

  var rayOrigin = cameraPosition;
  rayOrigin.y = -rayOrigin.y;

  let rayMarchResult = rayMarch( rayOrigin, rayDirection, voxelObjects);
  if(rayMarchResult.hit == false) {
    textureStore(normalTex, pixel, vec4(0.0));
    textureStore(albedoTex, pixel, vec4(0.0));
    textureStore(depthWrite, pixel, vec4(FAR_PLANE,0.0,0.0,0.0));
    textureStore(velocityTex, pixel, vec4(0.0));
    return;
  }

  let depth = distance(rayMarchResult.worldPos, cameraPosition);
  textureStore(depthWrite, GlobalInvocationID.xy, vec4(depth,0.0,0.0,0.0));

  textureStore(normalTex, pixel, vec4(rayMarchResult.normal,1));

  let lambert = dot(rayMarchResult.normal, normalize(vec3<f32>(0.5, 1.0, -0.5)));
  let albedo = rayMarchResult.colour.rgb;
  let colour = mix(albedo,vec3(lambert * rayMarchResult.colour.rgb),0.5);
  textureStore(albedoTex, pixel, vec4(colour,1));

  let velocity = getVelocity(rayMarchResult, viewProjections);
  textureStore(velocityTex, pixel, vec4(velocity,0));
}
