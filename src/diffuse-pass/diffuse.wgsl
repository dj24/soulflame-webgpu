@group(0) @binding(0) var<uniform> resolution : vec2<u32>;
@group(0) @binding(1) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(3) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(4) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
@group(0) @binding(5) var voxelsSampler : sampler;
@group(0) @binding(6) var diffuseStore : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(7) var<uniform> time : f32;
@group(0) @binding(8) var blueNoise : texture_2d<f32>;

// g-buffer
@group(1) @binding(0) var normalTex : texture_2d<f32>;
@group(1) @binding(1) var albedoTex : texture_2d<f32>;
@group(1) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(3) var depthTex : texture_2d<f32>;


fn reconstructPosition(cameraPosition: vec3<f32>, rayDirection: vec3<f32>, depth: f32) -> vec3<f32> {
  return cameraPosition + rayDirection * depth;
}

const PI = 3.1415926535897932384626433832795;
const BLUE_NOISE_TEXTURE_SIZE = 512;
// Function to compute Lambertian diffuse reflection
fn lambertianReflectance(normal: vec3<f32>, co: vec2<f32>) -> f32 {
    // Generate a random direction in the hemisphere
    let randomDir : vec3<f32> = randomInHemisphere(co, normal);

    // Lambertian reflectance model
    let cosTheta = dot(randomDir, normal);
    let lambertianTerm = max(cosTheta, 0.0) / PI;

    return lambertianTerm;
}

override reflectance: f32 = 0.5;
const SAMPLES_PER_PIXEL = 2;
const DOWNSCALE = 2;

// TODO: raymarch from surface instead of from camera
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  var averageRayColour = vec3(0.0);
  let frameIndex = u32(time);
  // TODO: make better sequence
  var outputPixel = GlobalInvocationID.xy * 2 + vec2(frameIndex % 2, (frameIndex / 2) %2); // (0,1), (1,0),

  var uv = vec2<f32>(outputPixel) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  let bounces = 1;

  for(var s = 0; s < SAMPLES_PER_PIXEL; s++){
    var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
    let normalSample = textureLoad(normalTex, outputPixel, 0).rgb;
    let depthSample = textureLoad(depthTex, outputPixel, 0).r;
    let worldPos = reconstructPosition(cameraPosition, rayDirection, depthSample) + normalSample * EPSILON; // EPSILON accounts for floating point errors
    var skyColour = vec3(1.0);

//  var blueNoiseSamplePosition = outputPixel + vec2((frameIndex % 8) * 64,(frameIndex + 1 % 8) * 64) + u32(s);
//  switch (frameIndex % 4){
//    case 0: {
//      blueNoiseSamplePosition = vec2(blueNoiseSamplePosition.x, BLUE_NOISE_TEXTURE_SIZE - blueNoiseSamplePosition.y);
//      break;
//    }
//    case 1: {
//      blueNoiseSamplePosition = vec2(BLUE_NOISE_TEXTURE_SIZE - blueNoiseSamplePosition.x, blueNoiseSamplePosition.y);
//      break;
//    }
//    case 2: {
//      blueNoiseSamplePosition = vec2(BLUE_NOISE_TEXTURE_SIZE - blueNoiseSamplePosition.x, BLUE_NOISE_TEXTURE_SIZE - blueNoiseSamplePosition.y);
//      break;
//    }
//    case 3: {
//      break;
//    }
//    default: {
//      break;
//    }
//  }
    var blueNoiseSamplePosition = outputPixel;


    let blueNoiseSample = textureLoad(blueNoise, blueNoiseSamplePosition % BLUE_NOISE_TEXTURE_SIZE, 0).rg;
    rayDirection = randomInHemisphere(blueNoiseSample, normalSample);
    var rayColour = skyColour;
    var rayOrigin = worldPos;

    for(var bounce = 0; bounce < bounces; bounce++){
      let rayMarchResult = rayMarch(0, rayOrigin, rayDirection, voxelObjects, voxelsSampler);
      let isValidHit = rayMarchResult.hit && distance(rayMarchResult.worldPos, rayOrigin) > EPSILON;
      if(!isValidHit){
        var unitDirection = unitVector(rayDirection);
        var attenuation = reflectance * (unitDirection.y + 1.0);
        rayColour = vec3(1.0-attenuation) + attenuation * skyColour;
        break;
      }
      rayDirection = randomInHemisphere(blueNoiseSample, rayMarchResult.normal);
      rayOrigin = rayMarchResult.worldPos;
      rayColour = rayColour * (rayMarchResult.colour * reflectance);
    }
    averageRayColour = averageRayColour + rayColour;
  }
  averageRayColour = averageRayColour / f32(SAMPLES_PER_PIXEL);

  for(var x = 0; x < DOWNSCALE; x++){
    for(var y = 0; y < DOWNSCALE; y++){
      textureStore(
        diffuseStore,
        GlobalInvocationID.xy * 2 + vec2(u32(x), u32(y)),
        vec4(averageRayColour, 1.0),
      );
    }
  }
}
