
const BLUE_NOISE_SIZE = 511;
const MAX_DISTANCE = 50.0;
const START_DISTANCE = 0.0;
const EXTINCTION = 0.05;
const FORWARD_SCATTER = 0.25;
const STEPS = 16.0;

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


// TODO: blur in direction of sun ray (convert to screen space)
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  var pixel = GlobalInvocationID.xy;
  let gBufferPixel = pixel * DOWNSCALE;
  var worldPos = textureLoad(worldPosTex, gBufferPixel, 0).rgb;
  var distanceFromCamera = min(length(worldPos - cameraPosition), MAX_DISTANCE);
  let rayDir = normalize(worldPos - cameraPosition);
  var blueNoisePixel = pixel % BLUE_NOISE_SIZE;
  let blueNoiseSample = textureLoad(blueNoiseTex, blueNoisePixel, 0).rg;
  var inScattering = vec3<f32>(0.0);
  var count = 0.0;

  var stepLength = distanceFromCamera / STEPS;
  var volColour = vec3(0.0);
  var absorption = vec3(1.0);
  var stepAbsorption = exp(-EXTINCTION * stepLength);
  var stepColour = vec3(1.0 - stepAbsorption) * henyeyGreenstein(dot(rayDir, sunDirection), FORWARD_SCATTER);
  for(var i = 0; i < i32(STEPS); i++){
    let positionAlongRay = cameraPosition + rayDir * (f32(i) * stepLength);
    absorption *= stepAbsorption;
    let directLight = select(1.0, 0.0, rayMarchBVHShadows(positionAlongRay, sunDirection).hit);
    volColour += stepColour * absorption * directLight;
  }

   textureStore(outputTex, pixel, vec4<f32>(volColour, 1.0));

//textureStore(outputTex, pixel, vec4<f32>(distanceFromCamera / MAX_DISTANCE));
//    let b = 0.01;
//    let t = length(worldPos - cameraPosition);
//    let fogAmount = 1.0 - exp(-t*b);
//    textureStore(outputTex, pixel, vec4<f32>(fogAmount));

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

const BLUR_RADIUS = 4.0;

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let shadowSampleUV = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(texSize);
  var fogAmount = vec4<f32>(0.0);
  var totalWeight = 0.0;
  let texelSize = 1.0 / vec2<f32>(textureDimensions(outputTex));

  for(var i = 0u; i < 25; i++){
    let foo = BLUR_SAMPLE_POSITIONS_AND_GAUSSIAN_WEIGHTS_5x5[i];
    let offset = foo.xy * texelSize * BLUR_RADIUS;
    let sampleUV = shadowSampleUV + offset;
    let fogSample = textureSampleLevel(intermediaryTexture, nearestSampler, sampleUV, 0.0);
    let gaussWeight = foo.z;
    totalWeight += gaussWeight;
    fogAmount += fogSample * gaussWeight;
  }
  fogAmount /= totalWeight;

  let colourSample = textureLoad(inputTex, GlobalInvocationID.xy, 0);

  textureStore(outputTex, GlobalInvocationID.xy, fogAmount);
}