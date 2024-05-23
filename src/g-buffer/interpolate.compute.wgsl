struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

struct VoxelObject {
  transform: mat4x4<f32>,
  inverseTransform: mat4x4<f32>,
  previousTransform: mat4x4<f32>,
  previousInverseTransform: mat4x4<f32>,
  size : vec3<f32>,
  atlasLocation : vec3<f32>,
  paletteIndex : f32,
}

// Textures
@group(0) @binding(0) var albedoTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var albedoCopyTex : texture_2d<f32>;
@group(0) @binding(2) var velocityTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var velocityCopyTex : texture_2d<f32>;
@group(0) @binding(4) var depthTex : texture_storage_2d<r32float, write>;
@group(0) @binding(5) var depthCopyTex : texture_2d<f32>;
@group(0) @binding(6) var normalTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(7) var normalCopyTex : texture_2d<f32>;

// Camera
@group(1) @binding(0) var<uniform> cameraPosition : vec3<f32>;
@group(1) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;

// Voxels
@group(2) @binding(0) var<storage> voxelObjects : array<VoxelObject>;


const neighborOffsets = array<vec2<i32>, 4>(
  vec2<i32>(0, 0),
  vec2<i32>(4, 0),
  vec2<i32>(0, 4),
  vec2<i32>(4, 4)
);

// Normal is in voxel (object) space, so will only have 1 or -1 values on one axis
fn checkSharedPlane(
  normal : vec3<f32>,
  voxelPos : vec3<f32>,
  neighborVoxelPos : vec3<f32>,
  neighborNormal : vec3<f32>
) -> bool {
  if(any(normal != neighborNormal)){
  return false;
  }
  if(abs(neighborNormal.x) > 0.0){
    return voxelPos.x == neighborVoxelPos.x;
  }
  if(abs(neighborNormal.y) > 0.0){
    return voxelPos.y == neighborVoxelPos.y;
  }
  if(abs(neighborNormal.z) > 0.0){
    return voxelPos.z == neighborVoxelPos.z;
  }
  return false;
}

@compute @workgroup_size(16, 8, 1)
 fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let texSize = textureDimensions(albedoCopyTex);
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let nearestFilledPixel = (pixel / 4) * 4;
  var albedo = vec4<f32>(0.0);
  var velocity = vec4<f32>(0.0);
  var totalWeight = 0.0;
  let nearestUV = vec2<f32>(nearestFilledPixel) / vec2<f32>(texSize);

  let velocityRef = textureLoad(velocityCopyTex, nearestFilledPixel, 0);

  var hasFoundObject = false;
  // Check if each neightbor is the same object
  for(var i = 1; i < 4; i = i + 1) {
    let objectIndex = textureLoad(velocityCopyTex, nearestFilledPixel + neighborOffsets[i], 0).a;
    if(objectIndex != velocityRef.a) {
      textureStore(velocityTex, pixel, vec4(velocityRef.xyz, -1.0));
     //TODO: march more rays instead
     textureStore(albedoTex, pixel, vec4(1.0, 0.0, 0.0, 1.0));
      return;
    }
    if(objectIndex != -1.0) {
      hasFoundObject = true;
    }
  }
  if(!hasFoundObject) {
    textureStore(velocityTex, pixel, vec4(velocityRef.xyz, -1.0));
    //TODO: march more rays instead
    textureStore(albedoTex, pixel, vec4(0.0, 1.0, 0.0, 1.0));
    return;
  }

  let voxelObject = voxelObjects[i32(velocityRef.a)];
  let depth = textureLoad(depthCopyTex, nearestFilledPixel, 0).r;
  let normal = textureLoad(normalCopyTex, nearestFilledPixel, 0).xyz;
  let localNormal = (voxelObject.inverseTransform * vec4(normal, 0.0)).xyz;
  let rayDirection = calculateRayDirection(nearestUV, viewProjections.inverseViewProjection);
  let worldPos = cameraPosition + rayDirection * depth;
  let localPos = (voxelObject.inverseTransform * vec4(worldPos, 1.0)).xyz;
  let voxelPos = floor(localPos);

  // Check if each neightbor is the same voxel plane
  for(var i = 0; i < 3; i = i + 1) {
    let neighborPixel = nearestFilledPixel + neighborOffsets[i];
    let neighborUV = vec2<f32>(neighborPixel) / vec2<f32>(texSize);
    let neighborDepth = textureLoad(depthCopyTex, neighborPixel, 0).r;
    let neighborNormal = textureLoad(normalCopyTex, neighborPixel, 0).xyz;
    let neighborLocalNormal = (voxelObject.inverseTransform * vec4(neighborNormal, 0.0)).xyz;
    let neighborRayDirection = calculateRayDirection(neighborUV, viewProjections.inverseViewProjection);
    let neighborWorldPos = cameraPosition + neighborRayDirection * neighborDepth;
    let neighborLocalPos = (voxelObject.inverseTransform * vec4(neighborWorldPos, 1.0)).xyz;
    let neighborVoxelPos = floor(neighborLocalPos);

    if(!checkSharedPlane(localNormal, voxelPos, neighborVoxelPos, neighborLocalNormal)) {
      textureStore(velocityTex, pixel, vec4(velocityRef.xyz, -1.0));
      //TODO: march more rays instead
      textureStore(albedoTex, pixel, vec4(0.0, 0.0, 1.0, 1.0));
      return;
    }
  }

  textureStore(velocityTex, pixel, velocityRef);
//  textureStore(albedoTex, pixel, vec4(depth, 0,0, 1));
//  textureStore(albedoTex, pixel, vec4(fract(localPos), 1));
//textureStore(albedoTex, pixel, vec4(abs(localNormal), 1));


  for(var i = 0; i < 4; i = i + 1) {
    let neighbor = nearestFilledPixel + neighborOffsets[i];
    let distanceToPixel = vec2<f32>(pixel - neighbor);
    let weight = 1.0 / (1.0 + dot(distanceToPixel, distanceToPixel));
    albedo += textureLoad(albedoCopyTex, neighbor, 0) * weight;
    velocity += textureLoad(velocityCopyTex, neighbor, 0) * weight;
    totalWeight += weight;
  }
  albedo /= totalWeight;
  velocity /= totalWeight;
  textureStore(albedoTex, pixel, albedo);
}