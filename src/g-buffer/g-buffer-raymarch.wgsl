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
  let vp = viewProjections.viewProjection;
    let previousVp = viewProjections.previousViewProjection;
    let modelMatrix = rayMarchResult.modelMatrix;
    let previousModelMatrix = rayMarchResult.previousModelMatrix;

    // Get current object space position of the current pixel
    let objectPos = rayMarchResult.objectPos.xyz;
    let objectClipSpace = vp * modelMatrix * vec4(objectPos.xyz, 1.0);
    let objectNDC = objectClipSpace.xyz / objectClipSpace.w;

    // Get previous position of the current object space position
    let previousObjectClipSpace = previousVp * previousModelMatrix * vec4(objectPos.xyz, 1.0);
    let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

    // Get velocity based on the difference between the current and previous positions
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

const FAR_PLANE = 10000.0;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  let pixel = GlobalInvocationID.xy;
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  let rayOrigin = vec3(cameraPosition.x, -cameraPosition.y, cameraPosition.z);
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

  // Floor plane for debugging
  let planeIntersect = planeIntersection(rayOrigin, rayDirection, vec3(0,1,0), 0.0);
  if(planeIntersect.isHit){
    closestIntersection.worldPos = rayOrigin + rayDirection * planeIntersect.tNear;
    closestIntersection.hit = planeIntersect.isHit;
    closestIntersection.normal = planeIntersect.normal;
    closestIntersection.colour = vec3(0.15,0.3,0.1);
  }

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(vec3(0.0), FAR_PLANE));
  textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
//  textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));
  textureStore(velocityTex, pixel, vec4(0.0));

  var totalSteps = 0;
  let maxMipLevel = u32(0);
  let minMipLevel = u32(0);
  var mipLevel = maxMipLevel;

  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
    let voxelObject = voxelObjects[i];
    if(any(voxelObject.size == vec3(0.0))){
      continue;
    }
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

    // Bounds for octree node
    let raymarchResult = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 1);
//    totalSteps += output.stepsTaken;
    if(raymarchResult.hit && distance(raymarchResult.worldPos, rayOrigin) < distance(closestIntersection.worldPos, rayOrigin)){
      closestIntersection = raymarchResult;
    }
  }

  let normal = closestIntersection.normal;
  let depth = distance(closestIntersection.worldPos, cameraPosition);
  let lambert = dot(normal, normalize(vec3<f32>(0.5, 1.0, -0.5)));
//  let albedo = vec3(mix(vec3(0.1,0,0.5), vec3(1,0.5,0.25), f32(totalSteps) / 50.0));
let albedo = closestIntersection.colour;
//let albedo = mix(vec3(0.0), vec3(closestIntersection.worldPos.x % 1),f32(totalSteps) / 50.0) ;
//  let albedo = vec3(closestIntersection.objectPos % 1.0);
  let colour = mix(albedo,vec3(lambert * albedo),1.0);
  let velocity = getVelocity(closestIntersection, viewProjections);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(closestIntersection.worldPos, depth));
  textureStore(albedoTex, pixel, vec4(albedo, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,0));
}
