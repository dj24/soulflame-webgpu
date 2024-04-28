

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  return rayMarchBVHFirstHit(worldPos, shadowRayDirection);
//    return rayMarchTransformed(voxelObjects[0], shadowRayDirection, worldPos, 0).hit;
}


const SUN_COLOR = vec3<f32>(0.9);
const MOON_COLOR = vec3<f32>(0.5, 0.5, 1.0);
const SKY_AMBIENT_INTENSITY = 0.1;
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
const BLUE_NOISE_SIZE = 511;
const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);
const SKY_COLOUR: vec3<f32> = vec3<f32>(0.6, 0.8, 0.9);
const SHADOW_ACNE_OFFSET: f32 = 0.005;
const SCATTER_AMOUNT: f32 = 0.75;
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

fn randomInCosineWeightedHemisphere(r: vec2<f32>, normal: vec3<f32>) -> vec3<f32> {
  let r1 = 2.0 * PI * r.x;
  let r2 = r.y;
  let r2s = sqrt(r2);
  let w = normal;
  let u = normalize(cross((select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0),abs(w.x) > 0.1)), w));
  let v = cross(w, u);
  return normalize(u * cos(r1) * r2s + v * sin(r1) * r2s + w * sqrt(1.0 - r2));
}

const SAMPLES_PER_PIXEL = 2u;
const SAMPLE_OFFSETS: array<vec2<i32>, 4> = array<vec2<i32>, 4>(
  vec2<i32>(0, 0),
  vec2<i32>(1, 1),
  vec2<i32>(0, 1),
  vec2<i32>(1, 0),
);

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let pixel = vec2<i32>(GlobalInvocationID.xy * DOWNSCALE);
  let outputPixel = vec2<i32>(GlobalInvocationID.xy);
  var blueNoisePixel = outputPixel % BLUE_NOISE_SIZE;
  var normalSample = textureLoad(normalTex, pixel, 0).rgb;
  var worldPos = textureLoad(worldPosTex, pixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
  var output = vec4<f32>(0.0);
  var count = 0.0;
  for(var i = 0u; i < SAMPLES_PER_PIXEL; i++){
    var samplePixel =  outputPixel + SAMPLE_OFFSETS[i];
    samplePixel.x += i32(time.frame) * 32;
    samplePixel.y += i32(time.frame) * 16;
    blueNoisePixel = samplePixel % BLUE_NOISE_SIZE;
    if(time.frame % 2 == 0){
      blueNoisePixel.y = BLUE_NOISE_SIZE - blueNoisePixel.y;
    }
    if(time.frame % 3 == 0){
      blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
    }
    var r = textureLoad(blueNoiseTex, blueNoisePixel, 0).rg;
    var shadowRayDirection = randomInCosineWeightedHemisphere(r, normalSample);
    shadowRayDirection = mix(sunDirection, shadowRayDirection, SCATTER_AMOUNT);
    if(shadowRay(worldPos, shadowRayDirection)){
        output += vec4(0.0);
        count += 1.0;
    } else{
        let sky = textureSampleLevel(skyCube, linearSampler, shadowRayDirection, 0.0) * 2.0;
        output += sky;
        count += 1.0;
    }
  }
  output /= count;
  textureStore(outputTex, outputPixel, output);
}

const PI = 3.1415926535897932384626433832795;

fn polarToCartesian(angle: f32, radius: f32) -> vec2<f32> {
  let radians = angle * PI / 180.0;
  let x = radius * cos(radians);
  let y = radius * sin(radians);
  return vec2<f32>(x, y);
}

const BLUR_RADIUS = 1.0;

// 3x3 Gaussian blur kernel, weight in z component
const BLUR_SAMPLE_POSITIONS_AND_GAUSSIAN_WEIGHTS: array<vec3<f32>, 9> = array<vec3<f32>, 9>(
  vec3<f32>(0.0, 0.0, 4.0 / 16.0),
  vec3<f32>(1.0, 0.0, 2.0 / 16.0),
  vec3<f32>(-1.0, 0.0, 2.0 / 16.0),
  vec3<f32>(0.0, 1.0, 2.0 / 16.0),
  vec3<f32>(0.0, -1.0, 2.0 / 16.0),
  vec3<f32>(1.0, 1.0, 1.0 / 16.0),
  vec3<f32>(-1.0, 1.0, 1.0 / 16.0),
  vec3<f32>(1.0, -1.0, 1.0 / 16.0),
  vec3<f32>(-1.0, -1.0, 1.0 / 16.0),
);

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


const DEPTH_SENSITIVITY = 100.0;

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let texelSize = 1.0 / vec2<f32>(texSize);
  let pixel = GlobalInvocationID.xy;
  let shadowSamplePixel = vec2<i32>(GlobalInvocationID.xy / DOWNSCALE);
  let shadowSampleUV = (vec2<f32>(pixel)) / vec2<f32>(texSize);
  let outputPixel = GlobalInvocationID.xy;
  let albedoSample = textureLoad(inputTex, pixel, 0);
  let normalRef = textureLoad(normalTex, pixel, 0).rgb;
  let depthRef = textureLoad(depthTex, pixel, 0).r;
  let shadowRef = textureSampleLevel(intermediaryTexture, linearSampler, shadowSampleUV, 0.0);

  var outputColour = vec4<f32>(0.0);
  var totalWeight = 0.0;

  for(var i = 0u; i < 25; i++){
    let foo = BLUR_SAMPLE_POSITIONS_AND_GAUSSIAN_WEIGHTS_5x5[i];
    let offset = foo.xy * texelSize;
    let sampleUV = shadowSampleUV + offset * BLUR_RADIUS;
    let samplePixel = vec2<i32>(sampleUV * vec2<f32>(texSize));
    let normalSample = textureSampleLevel(normalTex, linearSampler, sampleUV, 0.0).rgb;
    let depthSample = textureLoad(depthTex, samplePixel, 0).r;
    let shadowSample = textureSampleLevel(intermediaryTexture, linearSampler, sampleUV, 0.0);

    let relativeDepthDifference = abs(depthSample - depthRef) / depthRef;
    let depthWeight = clamp(1.0 - relativeDepthDifference * DEPTH_SENSITIVITY, 0,1);
    let normalWeight = dot(normalSample, normalRef);
    let gaussWeight = foo.z;

    let weight =  gaussWeight * normalWeight * depthWeight;

    totalWeight += weight;
    outputColour += shadowSample * weight;
  }
  outputColour /= totalWeight;

//  textureStore(outputTex, outputPixel, shadowRef);
  textureStore(outputTex, pixel,outputColour * albedoSample);
}
