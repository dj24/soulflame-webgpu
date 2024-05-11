
const BLUE_NOISE_SIZE = 511;
const MAX_DISTANCE = 40.0;
const START_DISTANCE = 0.0;
const EXTINCTION = vec3(.06, 0.04, 0.02);
const FORWARD_SCATTER = 0.8;
const STEPS = 16.0;
const NEAR  = 0.3;
const FAR = 10000.0;
const LIGHT_INTENSITY = 5.0;

fn ACESFilm(x: vec3<f32>) -> vec3<f32>{
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return (x*(a*x+b))/(x*(c*x+d)+e);
}

fn henyeyGreenstein(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5) / 4.0;
}

fn beerLambertLaw(distance: f32, extinction: f32) -> f32 {
  return exp(-distance * extinction);
}

fn screenBlend(base: vec4<f32>, blend: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(1.0) - (vec4<f32>(1.0) - blend) * (vec4<f32>(1.0) - base);
}


@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  var pixel = GlobalInvocationID.xy;
  let uv = vec2<f32>(pixel) / vec2<f32>(textureDimensions(outputTex));
  let gBufferPixel = pixel * DOWNSCALE;

  let depthSample = textureLoad(depthTex, gBufferPixel, 0).r;
  let normalSample = textureLoad(normalTex, gBufferPixel, 0).xyz;
  let distanceFromCamera = min(depthSample * (FAR - NEAR) + NEAR, MAX_DISTANCE);

  var stepLength = distanceFromCamera / STEPS;
  let rayDir = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  var blueNoisePixel = (vec2<i32>(pixel)) % BLUE_NOISE_SIZE;
  let blueNoiseSample = textureLoad(blueNoiseTex, blueNoisePixel, 0).rg;
  let startDistance = START_DISTANCE + random(blueNoiseSample) * stepLength;
  let rayOrigin = cameraPosition + rayDir * startDistance;
  var inScattering = vec3<f32>(0.0);
  var volColour = vec3(0.0);
  var absorption = vec3(1.0);
  var stepAbsorption = exp(-EXTINCTION * stepLength);
  var stepColour = vec3(1.0 - stepAbsorption) * henyeyGreenstein(dot(rayDir, sunDirection), FORWARD_SCATTER);
  var positionAlongRay = rayOrigin;
  var distanceTravelled = 0.0;
  for(var i = 0; i < i32(STEPS); i++){
    if(distanceTravelled > distanceFromCamera){
      break;
    }
    distanceTravelled += stepLength;
    positionAlongRay = rayOrigin + rayDir * distanceTravelled;
    absorption *= stepAbsorption;
    var directLight = LIGHT_INTENSITY;
    if(dot(normalSample, sunDirection) > 0.0){
      directLight = 0.0;
    }
    else if(rayMarchBVHShadows(positionAlongRay, sunDirection,1).hit){
      directLight = 0.0;
    }
    volColour += stepColour * absorption * directLight;
  }
  textureStore(outputTex, pixel, vec4<f32>(volColour, 1.0));
}

// 5x5 Gaussian blur kernel, weight in z component
const BLUR_SAMPLE_POSITIONS_AND_GAUSSIAN_WEIGHTS_5x5: array<vec3<f32>, 25> = array<vec3<f32>, 25>(
  vec3<f32>(0.0, 0.0, 41.0 / 273.0),
  vec3<f32>(1.0, 0.0, 26.0 / 273.0),
  vec3<f32>(-1.0, 0.0, 26.0 / 273.0),
  vec3<f32>(0.0, 1.0, 26.0 / 273.0),
  vec3<f32>(0.0, -1.0, 26.0 / 273.0),
  vec3<f32>(1.0, 1.0, 16.0 / 273.0),
  vec3<f32>(-1.0, 1.0, 16.0 / 273.0),
  vec3<f32>(1.0, -1.0, 16.0 / 273.0),
  vec3<f32>(-1.0, -1.0, 16.0 / 273.0),
  vec3<f32>(2.0, 0.0, 7.0 / 273.0),
  vec3<f32>(-2.0, 0.0, 7.0 / 273.0),
  vec3<f32>(0.0, 2.0, 7.0 / 273.0),
  vec3<f32>(0.0, -2.0, 7.0 / 273.0),
  vec3<f32>(2.0, 1.0, 4.0 / 273.0),
  vec3<f32>(-2.0, 1.0, 4.0 / 273.0),
  vec3<f32>(2.0, -1.0, 4.0 / 273.0),
  vec3<f32>(-2.0, -1.0, 4.0 / 273.0),
  vec3<f32>(1.0, 2.0, 4.0 / 273.0),
  vec3<f32>(-1.0, 2.0, 4.0 / 273.0),
  vec3<f32>(1.0, -2.0, 4.0 / 273.0),
  vec3<f32>(-1.0, -2.0, 4.0 / 273.0),
  vec3<f32>(2.0, 2.0, 1.0 / 273.0),
  vec3<f32>(-2.0, 2.0, 1.0 / 273.0),
  vec3<f32>(2.0, -2.0, 1.0 / 273.0),
  vec3<f32>(-2.0, -2.0, 1.0 / 273.0),
);

const BLUR_RADIUS = 1.0;

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let shadowSampleUV = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(texSize);
  var fogAmount = vec4<f32>(0.0);
  var totalWeight = 0.0;
  let texelSize = 1.0 / vec2<f32>(textureDimensions(outputTex));

  for(var i = 0u; i < 1; i++){
    let foo = BLUR_SAMPLE_POSITIONS_AND_GAUSSIAN_WEIGHTS_5x5[i];
    let offset = foo.xy * texelSize * BLUR_RADIUS;
    let sampleUV = shadowSampleUV + offset;
    let fogSample = textureSampleLevel(intermediaryTexture, linearSampler, sampleUV, 0.0);
    let gaussWeight = foo.z;
    totalWeight += gaussWeight;
    fogAmount += fogSample * gaussWeight;
  }
  fogAmount /= totalWeight;

  let colourSample = textureLoad(inputTex, GlobalInvocationID.xy, 0);

  let output = (fogAmount + colourSample).rgb;
//  let output = fogAmount.rgb;
  textureStore(outputTex, GlobalInvocationID.xy, vec4(output, 1));
}