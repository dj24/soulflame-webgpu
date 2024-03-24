const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);
const SHADOW_ACNE_OFFSET: f32 = 0.005;
const SKY_COLOUR: vec3<f32> = vec3<f32>(0.6, 0.8, 0.9);

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
    return rayMarchBVHCoarse(worldPos, shadowRayDirection);
//  return rayMarchBVH(worldPos, shadowRayDirection).hit;
}


// TODO: render at half res and increase samples
// 2 samples at full res = 8 samples at half res
const SAMPLE_COUNT = 1;
const SUN_COLOR = vec3<f32>(1.0, 1.0, 1.0);
const MOON_COLOR = vec3<f32>(0.5, 0.5, 1.0);
const SUBPIXEL_SAMPLE_POSITIONS: array<vec2<f32>, 8> = array<vec2<f32>, 8>(
  vec2<f32>(0.25, 0.25),
  vec2<f32>(0.75, 0.25),
  vec2<f32>(0.25, 0.75),
  vec2<f32>(0.75, 0.75),
  vec2<f32>(0.125, 0.125),
  vec2<f32>(0.375, 0.125),
  vec2<f32>(0.625, 0.125),
  vec2<f32>(0.875, 0.125)
);
const BLUE_NOISE_SIZE = 512;

fn blinnPhong(normal: vec3<f32>, lightDirection: vec3<f32>, viewDirection: vec3<f32>, specularStrength: f32, shininess: f32, lightColour: vec3<f32>) -> vec3<f32> {
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let specular = pow(max(dot(normal, halfDirection), 0.0), shininess);
  return (diffuse + specular * specularStrength) * lightColour;
}

struct Light {
  direction: vec3<f32>,
  colour: vec3<f32>,
};

const LIGHT_COUNT = 2;

// Function to remap the blue noise value to a sample index
fn remapToSampleIndex(blueNoiseValue: f32, numSamples: u32) -> u32 {
    // Map blue noise value to the index range [0, numSamples)
    return u32(blueNoiseValue * f32(numSamples));
}

const SCATTER_AMOUNT: f32 = 0.5;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let samplePixel = GlobalInvocationID.xy * DOWNSCALE;
  let outputPixel = GlobalInvocationID.xy;
  var blueNoisePixel = outputPixel % BLUE_NOISE_SIZE;
  if(time.frame % 2 == 0){
    blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
  }
  let blueNoiseUv = vec2<f32>(blueNoisePixel) / vec2<f32>(BLUE_NOISE_SIZE);
  let resolution = vec2<f32>(textureDimensions(depthTex));
  let uv = vec2<f32>(outputPixel) / resolution;
  var normalSample = textureLoad(normalTex, samplePixel, 0).rgb;
  var worldPos = textureLoad(worldPosTex, samplePixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
  let randomCo = vec2<f32>(samplePixel);
  var total = vec3(0.0);
  var count = 0.0;

  for(var i = 0; i < SAMPLE_COUNT; i++){
    let lights = array<Light, LIGHT_COUNT>(
      Light(
        -sunDirection,
        SUN_COLOR,
      ),
      Light(
              -sunDirection,
              SUN_COLOR,
            ),
//      Light(
//              vec3(-sunDirection.x, sunDirection.y, sunDirection.z),
//              vec3(1.0,0.8,0.6),
//            ),
    );


    var offset = SUBPIXEL_SAMPLE_POSITIONS[i] / vec2<f32>(BLUE_NOISE_SIZE);
    var r = textureSampleLevel(blueNoiseTex, nearestSampler, blueNoiseUv + offset, 0).xy;

    let randomSampleIndex = i32(randomMinMax(r, 0, LIGHT_COUNT));

    // TODO: store with reservoir sampling, and best sample
    var selectedLight = lights[randomSampleIndex];

    var shadowRayDirection = selectedLight.direction + randomInHemisphere(r, selectedLight.direction) * SCATTER_AMOUNT;
//    var shadowRayDirection = selectedLight.direction;

    if(shadowRay(worldPos, shadowRayDirection)){
      total += vec3(0.0);
    } else{
      let rayDirection = normalize(worldPos - cameraPosition);
      total += selectedLight.colour;
//      total += blinnPhong(normalSample, shadowRayDirection, rayDirection, 0.5, 80.0, selectedLight.colour);
    }
    count += 1.0;
  }
  total += SKY_COLOUR * 0.1;
  let shadowAmount = total / count;
  textureStore(outputTex, outputPixel, vec4(shadowAmount, 1.0));
}

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = vec2<f32>(textureDimensions(outputTex));
  let pixel = GlobalInvocationID.xy;
  let uv = (vec2<f32>(pixel) - vec2(0.5)) / texSize;
//  let shadowAmount = 1.0 - textureSampleLevel(intermediaryTexture, linearSampler, uv, 0.0);
  let inputSample = textureLoad(albedoTex, pixel, 0);
//  let depthRef = textureLoad(depthTex, pixel, 0).a;
//  let normalRef = textureLoad(normalTex, pixel, 0).rgb;
//  var total = vec3(0.0);
//  var count = 0.0;
//
//  for(var i = 2; i < 3; i+= 1) {
//    for(var j = 2; j < 3; j += 1) {
//      let offset = vec2(f32(i), f32(j)) / texSize;
//      let shadowSample = textureSampleLevel(intermediaryTexture, linearSampler, uv + offset, 0.0).rgb;
////      let depthSample = textureLoad(depthTex, vec2<i32>(pixel) + vec2(i, j), 0).a;
////      let normalSample = textureLoad(normalTex, vec2<i32>(pixel) + vec2(i, j), 0).rgb;
//      // bilateral blur
//      let gaussianWeight = exp(-(f32(i * i) + f32(j * j)) * 0.01);
////      let normalDifference = dot(normalSample, normalRef);
////      let normalWeight = 1.0 - exp(-normalDifference * normalDifference * 10.0);
//      total += shadowSample;
//      count += 1.0;
//    }
//  }
//  total /= count;
//  textureStore(outputTex, pixel, inputSample * vec4(total,1));
  textureStore(outputTex, pixel, textureLoad(intermediaryTexture, pixel, 0) * inputSample);
}