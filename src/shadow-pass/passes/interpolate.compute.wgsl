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
@group(0) @binding(0) var albedoTex : texture_2d<f32>;
@group(0) @binding(1) var velocityTex : texture_2d<f32>;
@group(0) @binding(2) var depthTex : texture_2d<f32>;
@group(0) @binding(3) var normalTex : texture_2d<f32>;
@group(0) @binding(4) var shadowTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var shadowCopyTex : texture_2d<f32>;

// Camera
@group(1) @binding(0) var<uniform> cameraPosition : vec3<f32>;
@group(1) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;

// Voxels
@group(2) @binding(0) var<storage> voxelObjects : array<VoxelObject>;
@group(2) @binding(1) var volumeAtlasTex : texture_3d<f32>;
@group(2) @binding(2) var paletteTex : texture_2d<f32>;

//
//// Screen Rays
//struct ScreenRay {
//  pixel : vec2<u32>,
//};
//@group(3) @binding(0) var<storage, read_write> indirectArgs : array<atomic<u32>>;
//@group(3) @binding(1) var<storage, read_write> screenRays : array<ScreenRay>;
//@group(3) @binding(2) var<storage, read_write> counter : array<atomic<u32>>;

const neighborOffsets = array<vec2<i32>, 4>(
  vec2<i32>(0, 0),
  vec2<i32>(3, 0),
  vec2<i32>(0, 3),
  vec2<i32>(3, 3)
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

// Increment the count of the ray buffers, and only increment the dispatch indirect args every 8 rays, due to the 64x1x1 workgroup size (8 ray groups, 8 rays per group)
//fn incrementCounters() -> u32{
//  let count = atomicAdd(&counter[0], 1);
//  if(count % 8 == 0){
//   atomicAdd(&indirectArgs[0], 1);
//  }
//  return count;
//}

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
  let texSize = textureDimensions(albedoTex);
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let uv = vec2<f32>(pixel) / vec2<f32>(texSize);
  let nearestFilledPixel = (pixel / 3) * 3;
  let isOriginPixel = all(pixel == nearestFilledPixel);

  let isCornerPixel = all(pixel == nearestFilledPixel + vec2(2));
  let nearestUV = vec2<f32>(nearestFilledPixel) / vec2<f32>(texSize);
  let velocityRef = textureLoad(velocityTex, nearestFilledPixel, 0);

  var hasFoundObject = false;
  // Check if each neightbor is the same object, object index is stored in the alpha channel of the velocity texture
  for(var i = 1; i < 4; i = i + 1) {
    let objectIndex = textureLoad(velocityTex, nearestFilledPixel + neighborOffsets[i], 0).a;
    if(objectIndex != velocityRef.a) {
       if(isOriginPixel){
         // Add to ray buffer
//         let count = incrementCounters();
//         screenRays[count].pixel = vec2<u32>(pixel);
       }
       else {
       textureStore(shadowTex, pixel, vec4(0.0));
       }
       return;
    }
    if(objectIndex != -1.0) {
      hasFoundObject = true;
    }
  }
  if(!hasFoundObject) {
    // Dont march any more rays - we have hit the sky
    return;
  }
  let voxelObject = voxelObjects[i32(velocityRef.a)];
  let shadowRef = textureLoad(shadowCopyTex, nearestFilledPixel, 0).r;
  let depthRef = textureLoad(depthTex, nearestFilledPixel, 0).r;
  let normalRef = textureLoad(normalTex, nearestFilledPixel, 0).xyz;
  let localNormal = (voxelObject.inverseTransform * vec4(normalRef, 0.0)).xyz;
  let rayDirection = calculateRayDirection(nearestUV, viewProjections.inverseViewProjection);
  let worldPosRef = cameraPosition + rayDirection * depthRef;
  let localPosRef = (voxelObject.inverseTransform * vec4(worldPosRef, 1.0)).xyz;
  let voxelPosRef = floor(localPosRef);

  // Check if each neightbor is the same voxel plane
  for(var i = 1; i < 4; i = i + 1) {
    let neighborPixel = nearestFilledPixel + neighborOffsets[i];
    let neighborUV = vec2<f32>(neighborPixel) / vec2<f32>(texSize);
    let neighborDepth = textureLoad(depthTex, neighborPixel, 0).r;
    let neighborNormal = textureLoad(normalTex, neighborPixel, 0).xyz;
    let neighborLocalNormal = (voxelObject.inverseTransform * vec4(neighborNormal, 0.0)).xyz;
    let neighborRayDirection = calculateRayDirection(neighborUV, viewProjections.inverseViewProjection);
    let neighborWorldPos = cameraPosition + neighborRayDirection * neighborDepth;
    let neighborLocalPos = (voxelObject.inverseTransform * vec4(neighborWorldPos, 1.0)).xyz;
    let neighborVoxelPos = floor(neighborLocalPos);

    if(!checkSharedPlane(localNormal, voxelPosRef, neighborVoxelPos, neighborLocalNormal)) {
      if(isOriginPixel){
        // Add to ray buffer
//        let count = incrementCounters();
//        screenRays[count].pixel = vec2<u32>(pixel);
      }else{
        textureStore(shadowTex, pixel, vec4(0.0));
      }
      return;
    }
  }

  let pixel0 = nearestFilledPixel;
  let pixel1 = nearestFilledPixel + vec2<i32>(3, 0);
  let pixel2 = nearestFilledPixel + vec2<i32>(0, 3);
  let pixel3 = nearestFilledPixel + vec2<i32>(3, 3);

  // Interpolate
  let shadow0 = shadowRef;
  let shadow1 = textureLoad(shadowCopyTex, pixel1, 0).r;
  let shadow2 = textureLoad(shadowCopyTex, pixel2, 0).r;
  let shadow3 = textureLoad(shadowCopyTex, pixel3, 0).r;

  let xInterp = f32(pixel.x) % 3.0 / 3.0;
  let yInterp = f32(pixel.y) % 3.0 / 3.0;

  let shadowBottom = mix(shadow0, shadow1, xInterp);
  let shadowTop = mix(shadow2, shadow3, xInterp);
  let shadow = mix(shadowBottom, shadowTop, yInterp);


  textureStore(shadowTex, pixel, vec4(shadow));

}