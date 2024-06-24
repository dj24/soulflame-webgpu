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
@group(0) @binding(8) var linearSampler : sampler;

// Camera
@group(1) @binding(0) var<uniform> cameraPosition : vec3<f32>;
@group(1) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;

// Voxels
@group(2) @binding(0) var<storage> voxelObjects : array<VoxelObject>;
@group(2) @binding(1) var volumeAtlasTex : texture_3d<f32>;
@group(2) @binding(2) var paletteTex : texture_2d<f32>;

//
//// Screen Rays
struct BufferRay {
  pixel : vec2<u32>
};

@group(3) @binding(0) var<storage, read_write> indirectArgs : array<atomic<u32>>;
@group(3) @binding(1) var<storage, read_write> rayBuffer : array<BufferRay>;
@group(3) @binding(2) var<storage, read_write> counter : array<atomic<u32>>;

fn incrementCounters() -> u32{
  let count = atomicAdd(&counter[0], 1);
  if(count % 4 == 0){
   atomicAdd(&indirectArgs[0], 1);
  }
  return count;
}

const neighborOffsets = array<vec2<i32>, 4>(
  vec2<i32>(-2, -1),// bottom left
  vec2<i32>(2, -1),// bottom right
  vec2<i32>(-1, 2),// top left
  vec2<i32>(2, 2)// top right
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


const ca = vec4(   3.0,  -6.0,   0.0,  4.0 ) /  6.0;
const cb = vec4(  -1.0,   6.0, -12.0,  8.0 ) /  6.0;
//const ca = vec4(   3.0,  -5.0,   0.0,  2.0 ) /  2.0; // Catmull-Rom
//const cb = vec4(  -1.0,   5.0,  -8.0,  4.0 ) /  2.0;


fn powers( x:f32 ) -> vec4<f32> { return vec4(x*x*x, x*x, x, 1.0); }

fn spline( x:f32, c0:vec4<f32>, c1:vec4<f32>, c2:vec4<f32>, c3:vec4<f32> ) -> vec4<f32>
{
  // We could expand the powers and build a matrix instead (twice as many coefficients
  // would need to be stored, but it could be faster.
  return c0 * dot( cb, powers(x + 1.0)) +
         c1 * dot( ca, powers(x      )) +
         c2 * dot( ca, powers(1.0 - x)) +
         c3 * dot( cb, powers(2.0 - x));
}

fn SAM( a:i32, b:i32, i:vec2<f32>, res: vec2<f32>) -> vec4<f32>
{
    return textureSampleLevel(shadowCopyTex, linearSampler, (i+vec2(f32(a),f32(b))+0.5)/res, 0);
}

fn texture_Bicubic( uv:vec2<f32> ) -> vec4<f32>
{
    let res = vec2<f32>(textureDimensions(shadowCopyTex));
    let p = res * uv - 0.5;
    let f = fract(p);
    let i = floor(p);

    return spline( f.y, spline( f.x, SAM(-1,-1, i, res), SAM( 0,-1, i, res), SAM( 1,-1, i, res), SAM( 2,-1, i, res)),
                        spline( f.x, SAM(-1, 0, i, res), SAM( 0, 0, i, res), SAM( 1, 0, i, res), SAM( 2, 0, i, res)),
                        spline( f.x, SAM(-1, 1, i, res), SAM( 0, 1, i, res), SAM( 1, 1, i, res), SAM( 2, 1, i, res)),
                        spline( f.x, SAM(-1, 2, i, res), SAM( 0, 2, i, res), SAM( 1, 2, i, res), SAM( 2, 2, i, res)));
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
  let mip1Pixel = vec2<i32>(GlobalInvocationID.xy) / 2;

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
//  let pixel = vec2<i32>(GlobalInvocationID.xy) + vec2<i32>(r * 8.0 - vec2(4.0));
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let uv = vec2<f32>(pixel) / vec2<f32>(texSize);

  // Nearest even pixel
  let nearestFilledPixel = mip1Pixel * 2;
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
         let count = incrementCounters();
         rayBuffer[count].pixel = vec2<u32>(pixel);
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
    textureStore(shadowTex, pixel, vec4(0.0));
    return;
  }
  let voxelObject = voxelObjects[i32(velocityRef.a)];
  // Loaded as mip1
  let shadowRef = textureLoad(shadowCopyTex, mip1Pixel, 0).r;
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
        let count = incrementCounters();
        rayBuffer[count].pixel = vec2<u32>(pixel);
      }else{
        textureStore(shadowTex, pixel, vec4(0.0));
      }
      return;
    }
  }
  var shadow = vec3<f32>(0.0);
  shadow = texture_Bicubic(uv).rgb;
  if(uv.y < 0.5){
    shadow = textureSampleLevel(shadowCopyTex, linearSampler, uv, 0).rgb;
  }

  textureStore(shadowTex, pixel, vec4(shadow, 1));
}