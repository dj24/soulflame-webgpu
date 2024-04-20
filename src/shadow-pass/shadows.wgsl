

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
//    return rayMarchBVHCoarse(worldPos, shadowRayDirection, 100000.0);
  return rayMarchBVH(worldPos, shadowRayDirection).hit;
//  return rayMarchBVH(worldPos, shadowRayDirection).hit;
}


const SUN_COLOR = vec3<f32>(0.9);
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
const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);
const SKY_COLOUR: vec3<f32> = vec3<f32>(0.6, 0.8, 0.9);
const SHADOW_ACNE_OFFSET: f32 = 0.005;
const SCATTER_AMOUNT: f32 = 0.5;
const POSITION_SCATTER_AMOUNT: f32 = 0.5;

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

// Function to remap the blue noise value to a sample index
fn remapToSampleIndex(blueNoiseValue: f32, numSamples: u32) -> u32 {
    // Map blue noise value to the index range [0, numSamples)
    return u32(blueNoiseValue * f32(numSamples));
}



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
  var r = textureSampleLevel(blueNoiseTex, nearestSampler, blueNoiseUv, 0).xy;
  var shadowAmount = vec3(0.0);
  let selectedLight = Light( -sunDirection,SUN_COLOR);
  var shadowRayDirection = selectedLight.direction;
  var worldPos = textureLoad(worldPosTex, samplePixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
  if(all(worldPos <= vec3(0.0))){
    textureStore(outputTex, outputPixel, vec4(0.0));
    return;
  }

//  worldPos += randomInPlanarUnitDisk(r, normalSample) * POSITION_SCATTER_AMOUNT;
//  shadowRayDirection += randomInHemisphere(r, selectedLight.direction) * SCATTER_AMOUNT;
  if(shadowRay(worldPos, shadowRayDirection)){
      textureStore(outputTex, outputPixel, vec4(1.0));
  }
}

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = vec2<f32>(textureDimensions(outputTex));
  let pixel = GlobalInvocationID.xy;
  let uv = (vec2<f32>(pixel) - vec2(0.5)) / texSize;
  let inputSample = textureLoad(albedoTex, pixel, 0);
  let shadowSample = 1.0 - textureLoad(intermediaryTexture, pixel, 0);
  textureStore(outputTex, pixel, shadowSample);
}