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
  octreeBufferIndex: u32
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
@group(2) @binding(1) var volumeAtlasTex : texture_3d<f32>;
@group(2) @binding(2) var paletteTex : texture_2d<f32>;

// Screen Rays
struct ScreenRay {
  pixel : vec2<u32>,
};
@group(3) @binding(0) var<storage, read_write> indirectArgs : array<atomic<u32>>;
@group(3) @binding(1) var<storage, read_write> screenRays : array<ScreenRay>;
@group(3) @binding(2) var<storage, read_write> counter : array<atomic<u32>>;

const neighborOffsets = array<vec2<i32>, 4>(
  vec2<i32>(0, 0),
  vec2<i32>(3, 0),
  vec2<i32>(0, 3),
  vec2<i32>(3, 3)
);

// Normal is in voxel (object) space, so will only have 1 or -1 values on one axis
fn isOnSharedPlane(
  normal : vec3<f32>,
  voxelPos : vec3<f32>,
  neighborVoxelPos : vec3<f32>,
  neighborNormal : vec3<f32>
) -> bool {
  let epsilon = 0.001;
  if(abs(neighborNormal.y) > 0.0 && abs(normal.y) > 0.0){
    return abs(voxelPos.y - neighborVoxelPos.y) < epsilon;
  }
  if(abs(neighborNormal.x) > 0.0 && abs(normal.x) > 0.0){
    return abs(voxelPos.x - neighborVoxelPos.x) < epsilon;
  }
  if(abs(neighborNormal.z) > 0.0 && abs(normal.z) > 0.0){
    return abs(voxelPos.z - neighborVoxelPos.z) < epsilon;
  }
  return false;
}

const NEAR_PLANE = 0.5;
const FAR_PLANE = 10000.0;

const REMAINING_RAY_OFFSETS = array<vec2<u32>, 8>(
  vec2<u32>(0,1),
  vec2<u32>(1,0),
  vec2<u32>(1,1),
  vec2<u32>(2,0),
  vec2<u32>(2,1),
  vec2<u32>(0,2),
  vec2<u32>(1,2),
  vec2<u32>(2,2)
);

// Increment the count of the ray buffers, and only increment the dispatch indirect args every 8 rays, due to the 64x1x1 workgroup size (8 ray groups, 8 rays per group)
fn incrementCounters() -> u32{
  let count = atomicAdd(&counter[0], 1);
  if(count % 8 == 0){
   atomicAdd(&indirectArgs[0], 1);
  }
  return count;
}

/**
  * Interpolate the depth, normal and uv of the pixel from the 4 nearest neighbors
  * if not valid for interpolation, add to a ray buffer for use in the next pass
  * Ray buffer is a list of pixel groups that need to be re-marched at full resolution
  * The stored value is the origin of the group ([0,0] in a [3x3] kernel)
  */
@compute @workgroup_size(16, 8, 1)
 fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let texSize = textureDimensions(albedoCopyTex);
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let uv = vec2<f32>(pixel) / vec2<f32>(texSize);
  let nearestFilledPixel = (pixel / 3) * 3;
  let isOriginPixel = all(pixel == nearestFilledPixel);

  let isCornerPixel = all(pixel == nearestFilledPixel + vec2(2));
  let nearestUV = vec2<f32>(nearestFilledPixel) / vec2<f32>(texSize);
  let velocityRef = textureLoad(velocityCopyTex, nearestFilledPixel, 0);
  let depthRef = textureLoad(depthCopyTex, nearestFilledPixel, 0).r;
  let distanceToSurface = logarithmicDepthToDistance(depthRef, NEAR_PLANE, FAR_PLANE);

  // disable interpolation for distances greater than 1000, due to precision issues
//  if(distanceToSurface > 9000){
//    if(isOriginPixel){
//      // Add to ray buffer
//      let count = incrementCounters();
//      screenRays[count].pixel = vec2<u32>(pixel);
//    }else{
//      textureStore(albedoTex, pixel, vec4(0.0, 0.0, 0.0, 1.0));
//      textureStore(normalTex, pixel, vec4(0.0, 0.0, 0.0, 1.0));
//      textureStore(velocityTex, pixel, vec4(velocityRef.xyz, -1.0));
//      textureStore(depthTex, pixel, vec4(0.0));
//    }
//    return;
//  }

  var hasFoundObject = false;
  // Check if each neightbor is the same object
  for(var i = 1; i < 4; i = i + 1) {
    let objectIndex = textureLoad(velocityCopyTex, nearestFilledPixel + neighborOffsets[i], 0).a;
    if(objectIndex != velocityRef.a) {
       if(isOriginPixel){
         // Add to ray buffer
         let count = incrementCounters();
         screenRays[count].pixel = vec2<u32>(pixel);
       }
       return;
    }
    if(objectIndex != -1.0) {
      hasFoundObject = true;
    }
  }
  if(!hasFoundObject) {
    // Dont march any more rays - we have hit the sky
    textureStore(velocityTex, pixel, vec4(velocityRef.xyz, -1.0));
    textureStore(depthTex, pixel, vec4(0.0));
    textureStore(normalTex, pixel, vec4(0.0, 0.0, 0.0, 1.0));
    textureStore(albedoTex, pixel, vec4(0.0, 0.0, 0.0, 1.0));
    return;
  }
  let voxelObject = voxelObjects[i32(velocityRef.a)];

  let normalRef = textureLoad(normalCopyTex, nearestFilledPixel, 0).xyz;
  let localNormal = (voxelObject.inverseTransform * vec4(normalRef, 0.0)).xyz;
  let rayDirection = calculateRayDirection(nearestUV, viewProjections.inverseViewProjection);
  let worldPosRef = cameraPosition + rayDirection * distanceToSurface;
  let localPosRef = (voxelObject.inverseTransform * vec4(worldPosRef, 1.0)).xyz;
  let voxelPosRef = floor(localPosRef);

  // Check if each neightbor is the same voxel plane
  for(var i = 0; i < 4; i = i + 1) {
    let neighborPixel = nearestFilledPixel + neighborOffsets[i];
    let neighborUV = vec2<f32>(neighborPixel) / vec2<f32>(texSize);
    let neighborDepth = textureLoad(depthCopyTex, neighborPixel, 0).r;
    let neighborNormal = textureLoad(normalCopyTex, neighborPixel, 0).xyz;
    let neighborLocalNormal = (voxelObject.inverseTransform * vec4(neighborNormal, 0.0)).xyz;
    let neighborRayDirection = calculateRayDirection(neighborUV, viewProjections.inverseViewProjection);
    let neighborWorldPos = cameraPosition + neighborRayDirection * logarithmicDepthToDistance(neighborDepth, NEAR_PLANE, FAR_PLANE);
    let neighborLocalPos = (voxelObject.inverseTransform * vec4(neighborWorldPos, 1.0)).xyz;
    let neighborVoxelPos = floor(neighborLocalPos);

    if(!isOnSharedPlane(localNormal, voxelPosRef, neighborVoxelPos, neighborLocalNormal)) {
      if(isOriginPixel){
        // Add to ray buffer
        let count = incrementCounters();
        screenRays[count].pixel = vec2<u32>(pixel);
      }else{
        textureStore(albedoTex, pixel, vec4(0.0, 0.0, 0.0, 1.0));
        textureStore(normalTex, pixel, vec4(0.0, 0.0, 0.0, 1.0));
        textureStore(velocityTex, pixel, vec4(velocityRef.xyz, -1.0));
        textureStore(depthTex, pixel, vec4(0.0));
      }
      return;
    }
  }

  let pixel0 = nearestFilledPixel;
  let pixel1 = nearestFilledPixel + vec2<i32>(3, 0);
  let pixel2 = nearestFilledPixel + vec2<i32>(0, 3);
  let pixel3 = nearestFilledPixel + vec2<i32>(3, 3);

  // Interpolate
  let normal0 = normalRef;
  let normal1 = textureLoad(normalCopyTex, pixel1, 0).xyz;
  let normal2 = textureLoad(normalCopyTex, pixel2, 0).xyz;
  let normal3 = textureLoad(normalCopyTex, pixel3, 0).xyz;

  let depth0 = depthRef;
  let depth1 = textureLoad(depthCopyTex, pixel1, 0).r;
  let depth2 = textureLoad(depthCopyTex, pixel2, 0).r;
  let depth3 = textureLoad(depthCopyTex, pixel3, 0).r;

  let xInterp = f32(pixel.x) % 3.0 / 3.0;
  let yInterp = f32(pixel.y) % 3.0 / 3.0;

  let depthBottom = mix(depth0, depth1, xInterp);
  let depthTop = mix(depth2, depth3, xInterp);
  let depth = mix(depthBottom, depthTop, yInterp);

  let normalTop = mix(normal0, normal1, xInterp);
  let normalBottom = mix(normal2, normal3, xInterp);
  let normal = mix(normalTop, normalBottom, yInterp);

  let worldPos =
    cameraPosition
    + calculateRayDirection(uv, viewProjections.inverseViewProjection)
    * logarithmicDepthToDistance(depth, NEAR_PLANE, FAR_PLANE);

  let localPos = (voxelObject.inverseTransform * vec4(worldPos, 1.0)).xyz;
  let voxelPos = floor(localPos);
  let atlasSamplePos = vec3<i32>(voxelObject.atlasLocation + voxelPos);
  let palettePos = textureLoad(volumeAtlasTex, atlasSamplePos, 0).r;
  let paletteX = i32(palettePos* 255.0);
  let paletteY = i32(voxelObject.paletteIndex);
  let albedo = textureLoad(paletteTex, vec2(paletteX, paletteY), 0).rgb;

  textureStore(albedoTex, pixel, vec4(albedo, 1.0));
  textureStore(velocityTex, pixel, velocityRef);
  textureStore(depthTex, pixel, vec4(depth));
  textureStore(normalTex, pixel, vec4(normal, 1.0));

}