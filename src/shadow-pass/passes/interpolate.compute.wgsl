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

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

// Textures
@group(0) @binding(0) var albedoTex : texture_2d<f32>;
@group(0) @binding(1) var velocityTex : texture_2d<f32>;
@group(0) @binding(2) var depthTex : texture_2d<f32>;
@group(0) @binding(3) var normalTex : texture_2d<f32>;
@group(0) @binding(4) var shadowTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var shadowCopyTex : texture_2d<f32>;
@group(0) @binding(6) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(7) var<uniform> time : Time;

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
  vec2<i32>(-2, -2),// bottom left
  vec2<i32>(4, -2),// bottom right
  vec2<i32>(-2, 4),// top left
  vec2<i32>(4, 4)// top right
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

fn hermiteBasis(t: f32) -> f32 {
    // Example Hermite basis functions:
    // h0(t) = 2t^3 - 3t^2 + 1
    // h1(t) = -2t^3 + 3t^2
    // h2(t) = t^3 - 2t^2 + t
    // h3(t) = t^3 - t^2
    return 2.0 * t * t * t - 3.0 * t * t + 1.0; // This is h0(t), similarly define others as needed
}

fn bilinearTextureLoad(tex: texture_2d<f32>,pixel: vec2<i32>) -> vec4<f32> {
    let origin = pixel / 2 * 2;
    let c00 = textureLoad(tex, origin, 0);
    let c10 = textureLoad(tex, origin + vec2<i32>(2, 0), 0);
    let c01 = textureLoad(tex, origin + vec2<i32>(0, 2), 0);
    let c11 = textureLoad(tex, origin + vec2<i32>(2, 2), 0);
    let t = f32(pixel.x - origin.x) / 2.0;
    let u = f32(pixel.y - origin.y) / 2.0;
    return mix(mix(c00, c10, t), mix(c01, c11, t), u);
}

// w0, w1, w2, and w3 are the four cubic B-spline basis functions
fn w0(a:f32) -> f32
{
	return (1.0 / 6.0) * (a * (a * (-a + 3.0) - 3.0) + 1.0);
}

fn w1(a:f32) -> f32
{
	return (1.0 / 6.0) * (a * a * (3.0 * a - 6.0) + 4.0);
}

fn w2(a:f32) -> f32
{
	return (1.0 / 6.0) * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0);
}

fn w3(a:f32) -> f32
{
	return (1.0 / 6.0) * (a * a * a);
}

// g0 and g1 are the two amplitude functions
fn g0(a:f32) -> f32
{
	return w0(a) + w1(a);
}

fn g1(a:f32) -> f32
{
	return w2(a) + w3(a);
}

// h0 and h1 are the two offset functions
fn h0(a:f32) -> f32
{
	return -1.0 + w1(a) / (w0(a) + w1(a));
}

fn h1(a:f32) -> f32
{
	return 1.0 + w3(a) / (w2(a) + w3(a));
}

fn BicubicSample(texture: texture_2d<f32>, UV: vec2<f32>, Scale: vec2<f32>, RTScale: f32) -> vec4<f32> {
    var scaledUV = Scale * RTScale;
    var st = UV * scaledUV + vec2<f32>(0.5);
    var invScale = vec2<f32>(1.0) / scaledUV;
    var iuv = floor(st);
    var fuv = fract(st);

    var g0x = g0(fuv.x);
    var g1x = g1(fuv.x);
    var h0x = h0(fuv.x);
    var h1x = h1(fuv.x);
    var h0y = h0(fuv.y);
    var h1y = h1(fuv.y);

    var p0 = (vec2<f32>(iuv.x + h0x, iuv.y + h0y) - vec2<f32>(0.5)) * invScale;
    var p1 = (vec2<f32>(iuv.x + h1x, iuv.y + h0y) - vec2<f32>(0.5)) * invScale;
    var p2 = (vec2<f32>(iuv.x + h0x, iuv.y + h1y) - vec2<f32>(0.5)) * invScale;
    var p3 = (vec2<f32>(iuv.x + h1x, iuv.y + h1y) - vec2<f32>(0.5)) * invScale;

    return vec4(0);
// TODO: update to use bilinearTextureLoad
//    return g0(fuv.y) * (g0x * bilinearTextureLoad(texture, p0) +
//                        g1x * bilinearTextureLoad(texture, p1)) +
//           g1(fuv.y) * (g0x * bilinearTextureLoad(texture, p2) +
//                        g1x * bilinearTextureLoad(texture, p3));
}

const BLUE_NOISE_SIZE = 512;

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

  var blueNoisePixel = vec2<i32>(GlobalInvocationID.xy);
  blueNoisePixel.x += i32(time.frame) * 32;
  blueNoisePixel.y += i32(time.frame) * 16;
  blueNoisePixel = blueNoisePixel % BLUE_NOISE_SIZE;
  if(time.frame % 2 == 0){
    blueNoisePixel.y = BLUE_NOISE_SIZE - blueNoisePixel.y;
  }
  if(time.frame % 3 == 0){
    blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
  }

  var r = textureLoad(blueNoiseTex, blueNoisePixel, 0).rg;
//  let pixel = vec2<i32>(GlobalInvocationID.xy) + vec2<i32>(r * 3.0 - vec2(1.5));
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let uv = vec2<f32>(pixel) / vec2<f32>(texSize);
  // Nearest even pixel
  let nearestFilledPixel = pixel / 2 * 2;
  let isOriginPixel = all(vec2<i32>(GlobalInvocationID.xy) == nearestFilledPixel);

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
  for(var i = 0; i < 4; i = i + 1) {
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

  let steps = select(5,13,uv.x> 0.5);
  let maxDistance = distance(vec2(0.0), vec2(2.0));

  var totalWeight = 0.0;
  var shadow = vec3(0.0);
  // Interpolate
//  for(var x = 0; x <= 4; x += 2){
//    for(var y = 0; y <= 4; y += 2){
//      let offsetPixel = nearestFilledPixel + vec2<i32>(x, y);
//      let distanceToPixel = distance(vec2<f32>(offsetPixel), vec2<f32>(pixel));
//      let t = clamp(distanceToPixel / maxDistance, 0.0, 1.0);
//      let weight = hermiteBasis(t);
////      let weight = 1.0 / (distanceToPixel * distanceToPixel);
//      if(uv.x> 0.5){
//       shadow += bilinearTextureLoad(shadowCopyTex, offsetPixel).rgb * weight;
//      } else{
//        shadow += textureLoad(shadowCopyTex, offsetPixel, 0).rgb * weight;
//      }
//
//      totalWeight += weight;
//    }
//  }

  if(uv.x> 0.5){
   shadow = bilinearTextureLoad(shadowCopyTex, pixel).rgb;
  } else{
    shadow = textureLoad(shadowCopyTex, pixel, 0).rgb;
  }



  textureStore(shadowTex, pixel, vec4(shadow, 1));
}