const FOG_STEPS: f32 = 16.0;
const FOG_HEIGHT_END: f32 = 8.0;
const FOG_DISTANCE: f32 = 24.0;
const FOG_MULTIPLIER: f32 = 3.5;
const NOISE_INFLUENCE: f32 = 0.75;
const WIND_SPEED: f32 = 0.04;
const NOISE_SCALE: f32 = 1.5;
const DEPTH_INFLUENCE: f32 = 0.5;

// Dense fog at fog start, no fog at fog end
fn calculateDensity(worldPos: vec3<f32>, cameraPosition: vec3<f32>) -> f32 {
  let height = worldPos.y;
  let heightFactor = exp(-(height / FOG_HEIGHT_END));
  var noiseFactor = (perlinNoise3(worldPos * NOISE_SCALE + vec3(f32(time.x) * WIND_SPEED, 0,0)) + 1) * 0.5;
  noiseFactor = mix(1.0, noiseFactor, NOISE_INFLUENCE);
  let depth = length(worldPos - cameraPosition);
  var depthFactor = 1.0 - exp(-depth / FOG_DISTANCE);
  depthFactor = mix(1.0, depthFactor, DEPTH_INFLUENCE);

  return heightFactor * FOG_MULTIPLIER * noiseFactor * depthFactor;
}

const G_SCATTERING = -0.125;

// Mie scaterring approximated with Henyey-Greenstein phase function.
fn computeScattering(lightDotView: f32) -> f32
{
  var result = 1.0f - G_SCATTERING * G_SCATTERING;
  result /= (4.0f * PI * pow(1.0f + G_SCATTERING * G_SCATTERING - (2.0f * G_SCATTERING) * lightDotView, 1.5f));
  return result;
}

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
      let voxelObject = voxelObjects[i];
      if(any(voxelObject.size == vec3(0.0))){
        continue;
      }
      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(worldPos, 1.0)).xyz;
      let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(shadowRayDirection, 0.0)).xyz;
      let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
      let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
      if(!intersect.isHit && !isInBounds) {
        continue;
      }
      // Advance ray origin to the point of intersection
      if(!isInBounds){
        objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
      }
      let output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
      if(output.hit){
        return true;
      }
  }
  return false;
}

fn worldToScreen(worldPos: vec3<f32>) -> vec2<f32> {
  let clipSpace = viewProjections.viewProjection * vec4<f32>(worldPos, 1.0);
  let ndc = clipSpace.xyz / clipSpace.w;
  let screenSpace = (ndc + vec3<f32>(1.0)) * vec3<f32>(0.5);
  return screenSpace.xy;
}

const SUN_COLOR = vec3<f32>(3.0);
const MOON_COLOR = vec3<f32>(1.5, 1.5, 3.0);
const BLUE_NOISE_SIZE = 512;
const MAX_STEP_DISTANCE = 3.0;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    var pixel = GlobalInvocationID.xy * DOWNSCALE;

    let blueNoisePixel = pixel % BLUE_NOISE_SIZE;
    let blueNoiseUv = vec2<f32>(blueNoisePixel) / vec2<f32>(BLUE_NOISE_SIZE);
    let randomCo = textureLoad(blueNoiseTex, blueNoisePixel, 0).xy;

    let resolution = textureDimensions(depthTex);
    var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);

    let depthSample = textureLoad(depthTex, pixel, 0);
    var rayOrigin = cameraPosition;
    let worldPos = depthSample.rgb;
    let depth = depthSample.a;
    let rayVector = worldPos - rayOrigin;
    let rayDirection = rayVector / length(rayVector);
    let stepLength = clamp(depth / FOG_STEPS, 0.0, MAX_STEP_DISTANCE);

    let step = rayDirection * stepLength;

    let scatterAmount = 0.05;
    var shadowRayDirection = -sunDirection + randomInHemisphere(randomCo, -sunDirection) * scatterAmount;
//    var shadowRayDirection = -sunDirection;
    var lightColour = SUN_COLOR;

    if(randomCo.x < 0.5){
      shadowRayDirection.z *= -1.0;
      lightColour = vec3(3,0,0);
    }

    var accumFog = vec3(0.0);
    var samplePos = rayOrigin;
    var totalFog = 0.0;

    for(var i = 0.0; i < FOG_STEPS; i += 1.0) {
      if(distance(samplePos, rayOrigin) > depth) {
        break;
      }
      let isInShadow = shadowRay(samplePos,shadowRayDirection);
      if(!isInShadow){
        let density = calculateDensity(samplePos, cameraPosition);
        let fogAmount = computeScattering(dot(rayDirection, -shadowRayDirection)) * density;
        accumFog += fogAmount * lightColour;
        totalFog += fogAmount;
      }
      samplePos += step;
    }
    accumFog /= FOG_STEPS;
    totalFog /= FOG_STEPS;
    textureStore(outputTex, GlobalInvocationID.xy, vec4(accumFog, totalFog));
}

const PI = 3.1415926535897932384626433832795;

fn gammaCorrect(color: vec4<f32>) -> vec4<f32> {
  return pow(color, vec4<f32>(1.0 / 2.2));
}
const BLUR_RADIUS = 2;
const INTENSITY_SIGMA = 1.0;

@compute @workgroup_size(8, 8, 1)
fn blur(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let fogTexDimensions = vec2<f32>(textureDimensions(intermediaryTexture));
  let outputTexDimensions = vec2<f32>(textureDimensions(outputTex));

  var pixel = GlobalInvocationID.xy;
  let uv = vec2<f32>(pixel) / outputTexDimensions;

  var fogPixel = pixel / DOWNSCALE;

  // use blue noise to select random neighbours
  var blueNoisePixel = pixel % BLUE_NOISE_SIZE;
  if(time.x % 2 == 0){
    blueNoisePixel.x = 512 - blueNoisePixel.x;
  }
  let randomCo = textureLoad(blueNoiseTex, blueNoisePixel, 0).xy;
  var randomOffset = vec2(0);
  if(randomCo.x < 0.25){
    randomOffset.x = -1;
  }
  if(randomCo.y < 0.25){
    randomOffset.y = -1;
  }
  if(randomCo.x > 0.75){
    randomOffset.x = 1;
  }
  if(randomCo.y > 0.75){
    randomOffset.y = 1;
  }
  let offsetSamplePos = vec2<i32>(fogPixel) + vec2<i32>(randomOffset);
  let uvOffset = vec2<f32>(randomOffset) / fogTexDimensions;
//  let fogAmount = textureLoad(intermediaryTexture, offsetSamplePos, 0);
  let fogAmount = textureSampleLevel(intermediaryTexture, linearSampler, uv + uvOffset, 0);
  let inputSample = textureLoad(inputTex, pixel, 0);

//  textureStore(outputTex, GlobalInvocationID.xy, vec4(depthRef * 0.01));
//fogAmount = gammaCorrect(fogAmount);
//textureStore(outputTex, GlobalInvocationID.xy, fogAmount);
textureStore(outputTex, GlobalInvocationID.xy, mix(inputSample, vec4(fogAmount.rgb,1.0), vec4(fogAmount.a * 5.0)));
}