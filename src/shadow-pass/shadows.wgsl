

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  return rayMarchBVH(worldPos, shadowRayDirection).hit;
//    return rayMarchTransformed(voxelObjects[0], shadowRayDirection, worldPos, 0).hit;
}


const SUN_COLOR = vec3<f32>(0.9);
const MOON_COLOR = vec3<f32>(0.5, 0.5, 1.0);
const SKY_AMBIENT_INTENSITY = 0.15;
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
const SCATTER_AMOUNT: f32 = 0.05;
const POSITION_SCATTER_AMOUNT: f32 = 0.01;

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
  let selectedLight = Light(sunDirection,SUN_COLOR);
  var shadowRayDirection = selectedLight.direction;
  var worldPos = textureLoad(worldPosTex, samplePixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
  if(all(worldPos <= vec3(0.0))){
    textureStore(outputTex, outputPixel, vec4(1.0));
    return;
  }

  worldPos += randomInPlanarUnitDisk(r, normalSample) * POSITION_SCATTER_AMOUNT;
  shadowRayDirection += randomInHemisphere(r, selectedLight.direction) * SCATTER_AMOUNT;
  if(shadowRay(worldPos, shadowRayDirection)){
      textureStore(outputTex, outputPixel, vec4(0.0));
  } else{
      textureStore(outputTex, outputPixel, vec4(1.0));
  }
}

const PI = 3.1415926535897932384626433832795;

fn polarToCartesian(angle: f32, radius: f32) -> vec2<f32> {
  let radians = angle * PI / 180.0;
  let x = radius * cos(radians);
  let y = radius * sin(radians);
  return vec2<f32>(x, y);
}

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let pixel = GlobalInvocationID.xy;
  let uv = (vec2<f32>(pixel) - vec2(0.5)) / vec2<f32>(texSize);
  let inputSample = textureLoad(albedoTex, pixel, 0);
  let shadowRef = textureLoad(intermediaryTexture, pixel, 0);
  let normalRef = textureLoad(normalTex, pixel, 0).rgb;
  let worldPosRef = textureLoad(worldPosTex, pixel, 0).rgb;
  let distanceRef = distance(worldPosRef, cameraPosition);

  var output = vec3(0.0);
  var totalWeight = 0.0;
  var radius = 2;
  // Max distance the sample can be from the reference point
  var distanceThreshold = 0.2;
  for(var i = 0; i <= 12; i++){
    let angle = (i % 6) * 60; // 0, 90, 180, 270
    let radius = i;
    let offsetPixel = vec2<i32>(pixel) + vec2<i32>(polarToCartesian(f32(angle), f32(radius)));
    let shadowSample =  textureLoad(intermediaryTexture, offsetPixel, 0);
    let normalSample = textureLoad(normalTex, offsetPixel, 0).rgb;
    let worldPosSample = textureLoad(worldPosTex, offsetPixel, 0).rgb;
    let normalWeight = dot(normalSample, normalRef);
    let distanceSample = distance(worldPosSample, worldPosRef);
    let distanceWeight = (1.0 - clamp(distanceSample / distanceThreshold, 0.0, 1.0));
    let sampleWeight =  distanceWeight * normalWeight;
    output += shadowSample.rgb * sampleWeight;
    totalWeight+= sampleWeight;
  }
  output/= totalWeight;

  textureStore(outputTex, pixel,vec4(output, 1));

  let selectedLight = Light(sunDirection,SUN_COLOR);
  let viewDirection = normalize(cameraPosition - worldPosRef);
  let reflectance = blinnPhong(normalRef, selectedLight.direction, viewDirection, 0.5, 32.0, selectedLight.colour);
//  textureStore(outputTex, pixel, vec4(output * reflectance * inputSample.rgb, 1));
}