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
@group(0) @binding(6) var depthWrite : texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<rg32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(10) var<uniform> resolution : vec2<u32>;


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

fn project(mvp: mat4x4<f32>, p: vec3<f32>) -> vec3<f32> {
  let clipSpaceVertex = mvp * vec4(p,1.0);
  var ndc = clipSpaceVertex.xyz / clipSpaceVertex.w;
  ndc = clamp(ndc, vec3<f32>(-1.0), vec3<f32>(1.0));
  var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
  uv.y = 1.0 - uv.y;
  let screenSpaceVertex = vec2<f32>(uv * vec2<f32>(resolution));
  return vec3<f32>(screenSpaceVertex, clipSpaceVertex.z);
}

fn minMaxProjectedBounds(voxelObject: VoxelObject, viewProjection: mat4x4<f32>) -> vec4<u32> {
  var minPos = vec2<u32>(resolution.x, resolution.y);
  var maxPos = vec2<u32>(0, 0);

  let corners =  array<vec3<f32>, 8>(
    vec3(0.0),
    vec3(voxelObject.size.x, 0.0, 0.0),
    vec3(0.0, voxelObject.size.y, 0.0),
    vec3(voxelObject.size.x, voxelObject.size.y, 0.0),
    vec3(0.0, 0.0, voxelObject.size.z),
    vec3(voxelObject.size.x, 0.0, voxelObject.size.z),
    vec3(0.0, voxelObject.size.y, voxelObject.size.z),
    voxelObject.size,
  );

  let mvp = viewProjection * voxelObject.transform;

  for(var i = 0u; i < 8u; i++) {
    let corner = corners[i];
    let projected = project(mvp, corner);
    minPos = min(minPos, vec2(u32(projected.x), u32(projected.y)));
    maxPos = max(maxPos, vec2(u32(projected.x), u32(projected.y)));
  }

  return vec4<u32>(minPos, maxPos);
}

const FAR_PLANE = 10000.0;

@compute @workgroup_size(8, 8, 1)
fn main2(
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

  var voxelObject = voxelObjects[0];


  let rayMarchResult = rayMarch( rayOrigin, rayDirection, voxelObjects);
  let depth = distance(rayMarchResult.worldPos, cameraPosition);
  let lambert = dot(rayMarchResult.normal, normalize(vec3<f32>(0.5, 1.0, -0.5)));
  let albedo = rayMarchResult.colour.rgb;
  let colour = mix(albedo,vec3(lambert * rayMarchResult.colour.rgb),0.5);
  let velocity = getVelocity(rayMarchResult, viewProjections);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(depth,0.0,0.0,0.0));
  textureStore(albedoTex, pixel, vec4(colour,1));
  textureStore(normalTex, pixel, vec4(rayMarchResult.normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,0));
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  let pixel = GlobalInvocationID.xy;
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  let rayOrigin = vec3(cameraPosition.x, -cameraPosition.y, cameraPosition.z);
  let mipLevel = u32(0);

  textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
  textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));

  var output = RayMarchResult();

  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
    let voxelObject = voxelObjects[i];
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
    let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
    if(!intersect.isHit && !isInBounds) {
      continue;
    }
    // Advance ray origin to the point of intersection
    if(!isInBounds){
      objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
    }
    output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, mipLevel);

  }

  let normal = output.normal;
  let depth = distance(output.worldPos, cameraPosition);
  let lambert = dot(normal, normalize(vec3<f32>(0.5, 1.0, -0.5)));
  let albedo = output.colour.rgb;
  let colour = mix(albedo,vec3(lambert * albedo),0.5);
  let velocity = getVelocity(output, viewProjections);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(output.worldPos, depth));
  textureStore(albedoTex, pixel, vec4(albedo, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,0));
}
