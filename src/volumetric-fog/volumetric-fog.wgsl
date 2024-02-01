const FOG_STEPS: f32 = 16.0;
const FOG_HEIGHT_START: f32 = 0.0;
const FOG_HEIGHT_END: f32 = 72.0;

// Dense fog at fog start, no fog at fog end
fn calculateDensity(worldPos: vec3<f32>) -> f32 {
  let height = worldPos.y;
  let heightFactor = clamp((height - FOG_HEIGHT_START) / (FOG_HEIGHT_END - FOG_HEIGHT_START), 0.0, 1.0);
  return heightFactor;
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

const G_SCATTERING = -0.125;

// Mie scaterring approximated with Henyey-Greenstein phase function.
fn computeScattering(lightDotView: f32) -> f32
{
  var result = 1.0f - G_SCATTERING * G_SCATTERING;
  result /= (4.0f * PI * pow(1.0f + G_SCATTERING * G_SCATTERING - (2.0f * G_SCATTERING) * lightDotView, 1.5f));
  return result;
}

const SUN_COLOR = vec3<f32>(3.0);

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    var pixel = GlobalInvocationID.xy * DOWNSCALE;
    let resolution = textureDimensions(depthTex);
    var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);

    let depthSample = textureLoad(depthTex, pixel, 0);
    var rayOrigin = cameraPosition;
    let worldPos = depthSample.rgb;
    let rayVector = worldPos - rayOrigin;
    let rayDirection = rayVector / length(rayVector);
    let stepLength = length(rayVector) / FOG_STEPS;
    let step = rayDirection * stepLength;

    let depth = depthSample.a;
    let randomCo = uv;
    let scatterAmount = 0.05;
    let shadowRayDirection = -sunDirection + randomInHemisphere(randomCo, -sunDirection) * scatterAmount;
//    let shadowRayDirection = -sunDirection;

    var accumFog = vec3(0.0);
    var samplePos = rayOrigin;
    var totalFog = 0.0;

    for(var i = 0.0; i < FOG_STEPS; i += 1.0) {
      let isInShadow = shadowRay(samplePos,shadowRayDirection);
      if(!isInShadow){
        let fogAmount = computeScattering(dot(rayDirection, -shadowRayDirection));
        accumFog += fogAmount * SUN_COLOR;
        totalFog += fogAmount;
      }
      samplePos += step;
    }
    accumFog /= FOG_STEPS;
    totalFog /= FOG_STEPS;
    textureStore(outputTex, GlobalInvocationID.xy, vec4(accumFog, totalFog));
}

const PI = 3.1415926535897932384626433832795;

fn gammaCorrect(color: vec3<f32>) -> vec3<f32> {
  return pow(color, vec3<f32>(1.0 / 2.2));
}

@compute @workgroup_size(8, 8, 1)
fn blur(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let fogTexDimensions = vec2<f32>(textureDimensions(intermediaryTexture));
  let outputTexDimensions = vec2<f32>(textureDimensions(outputTex));
  let fogUv = vec2<f32>(GlobalInvocationID.xy) / outputTexDimensions;
  var pixel = GlobalInvocationID.xy;

  let depthRef = textureLoad(depthTex, pixel, 0).a;
  // gaussian blur
  var total = vec4(0.0);
  var count = 0.0;
  for(var i = 0; i <= DOWNSCALE; i+= 1) {
    for(var j = 0; j <= DOWNSCALE; j += 1) {
      let fogSample = textureSampleLevel(intermediaryTexture, linearSampler, fogUv + vec2(f32(i), f32(j)) / fogTexDimensions, 0.0);
      let depthSample = textureLoad(depthTex, vec2<i32>(pixel) + vec2(i, j), 0).a;
      // bilateral blur
      let depthDifference = abs(depthSample - depthRef);
      let depthWeight = exp(-depthDifference * depthDifference * 50.0);
//      let gaussianWeight = exp(-(f32(i) * f32(i) + f32(j) * f32(j)) / 2.0);
let gaussianWeight = 1.0;
      total += fogSample * depthWeight * gaussianWeight;
      count += depthWeight * gaussianWeight;
    }
  }
  var fogAmount = (total / count);
  let inputSample = textureLoad(inputTex, pixel, 0);

//  textureStore(outputTex, GlobalInvocationID.xy, mix(inputSample, fogAmount, fogAmount.a));
textureStore(outputTex, GlobalInvocationID.xy, mix(inputSample, vec4(fogAmount.rgb,1.0), vec4(fogAmount.a * 5.0)));
}