

fn diffuseRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>, normal: vec3<f32>) -> bool {
  let rayOrigin = worldPos + shadowRayDirection * 0.33; // To adccount for self occlusion of higher mip
  return rayMarchBVHShadows(rayOrigin, shadowRayDirection, 1).hit;
}

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>, normal: vec3<f32>) -> bool {
  let rayOrigin = worldPos + normal * 0.33; // To adccount for self occlusion of higher mip
  return rayMarchBVHShadows(rayOrigin, shadowRayDirection, 1).hit;
}


const SUN_COLOR = vec3(0.6,0.5,0.4) * 200.0;
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
const BLUE_NOISE_SIZE = 511;
const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);
const SKY_COLOUR: vec3<f32> = vec3<f32>(0.6, 0.8, 0.9);
const SHADOW_ACNE_OFFSET: f32 = 0.005;
const SCATTER_AMOUNT: f32 = 0.05;
const POSITION_SCATTER_AMOUNT: f32 = 0.25;

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

const SAMPLES_PER_PIXEL = 1u;
const SAMPLE_OFFSETS: array<vec2<i32>, 4> = array<vec2<i32>, 4>(
  vec2<i32>(0, 0),
  vec2<i32>(1, 1),
  vec2<i32>(0, 1),
  vec2<i32>(1, 0),
);

/** alternate frame checkerboard pattern
  0,1
  1,0

  then
  1,0
  0,1
*/
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let checkerboardIndex = i32(GlobalInvocationID.x % 2);
  let frameIndex = i32(time.frame % 2);
  let offset = vec2<i32>(checkerboardIndex);
  var pixel = vec2<i32>(i32(GlobalInvocationID.x), i32(GlobalInvocationID.y) * 2);
  pixel.y += checkerboardIndex;
  pixel.x += frameIndex;
  let outputPixel = pixel;
  var normalSample = textureLoad(normalTex, pixel, 0).rgb;
  var worldPos = textureLoad(worldPosTex, pixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
  var samplePixel = outputPixel;
  samplePixel.x += i32(time.frame) * 32;
  samplePixel.y += i32(time.frame) * 16;
  var blueNoisePixel = samplePixel % BLUE_NOISE_SIZE;
  if(time.frame % 2 == 0){
    blueNoisePixel.y = BLUE_NOISE_SIZE - blueNoisePixel.y;
  }
  if(time.frame % 3 == 0){
    blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
  }
  var r = textureLoad(blueNoiseTex, blueNoisePixel, 0).rg;
  let sampleWorldPos = worldPos + randomInPlanarUnitDisk(r, normalSample) * POSITION_SCATTER_AMOUNT;
  var diffuseDirection = randomInCosineWeightedHemisphere(r, normalSample);

  var radiance = vec3(0.1);
  let shadowRayDirection = sunDirection + randomInCosineWeightedHemisphere(r, sunDirection) * SCATTER_AMOUNT;
  if(!shadowRay(sampleWorldPos, shadowRayDirection, normalSample)){
    let viewDirection = normalize(cameraPosition - worldPos);
    let diffuse = max(dot(normalSample, sunDirection), 0.0);
    let specular = pow(max(dot(normalSample, normalize(sunDirection + viewDirection)), 0.0), 32.0);
    let lightIntensity = SUN_COLOR * (diffuse + specular);
    radiance += lightIntensity;
  }
  if(!diffuseRay(sampleWorldPos, diffuseDirection, normalSample)){
      let sky = textureSampleLevel(skyCube, linearSampler, diffuseDirection, 0.0);
      radiance += clamp(vec3(sky.rgb), vec3(0.0), vec3(32.0));
  }

  textureStore(outputTex, outputPixel, vec4(radiance, 1.0));
}

const PI = 3.1415926535897932384626433832795;

fn polarToCartesian(angle: f32, radius: f32) -> vec2<f32> {
  let radians = angle * PI / 180.0;
  let x = radius * cos(radians);
  let y = radius * sin(radians);
  return vec2<f32>(x, y);
}

fn calculateVariance(neighborhood: array<vec3<f32>, 9>) -> f32 {
    var mean: vec3<f32> = vec3<f32>(0.0);
    var variance: f32 = 0.0;

    // Calculate the mean
    for (var i = 0; i < 9; i = i + 1) {
        mean = mean + neighborhood[i];
    }
    mean = mean / 9.0;

    // Calculate the variance
    for (var i = 0; i < 9; i = i + 1) {
        let diff: vec3<f32> = neighborhood[i] - mean;
        variance = variance + dot(diff, diff);
    }

    return variance / 9.0;
}

fn calculateVarianceDepth(neighborhood: array<f32, 9>) -> f32 {
    var mean: f32 = 0.0;
    var variance: f32 = 0.0;

    // Calculate the mean
    for (var i = 0; i < 9; i = i + 1) {
        mean = mean + neighborhood[i];
    }
    mean = mean / 9.0;

    // Calculate the variance
    for (var i = 0; i < 9; i = i + 1) {
        let diff: f32 = neighborhood[i] - mean;
        variance = variance + diff * diff;
    }

    return variance / 9.0;
}

const NEIGHBORHOOD_SAMPLE_POSITIONS = array<vec2<i32>, 8>(
    vec2<i32>(-1, -1),
    vec2<i32>(0, -1),
    vec2<i32>(1, -1),
    vec2<i32>(-1, 0),
    vec2<i32>(1, 0),
    vec2<i32>(-1, 1),
    vec2<i32>(0, 1),
    vec2<i32>(1, 1)
);

const TEMPORAL_DEPTH_THRESHOLD =4.0;
const DEPTH_SENSITIVITY = 50.0;
const BLUR_RADIUS = 2.0;
const GOLDEN_RATIO = 1.61803398875;

@compute @workgroup_size(8, 8, 1)
fn denoise(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let texelSize = 1.0 / vec2<f32>(texSize);
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let shadowSampleUV = (vec2<f32>(pixel)) / vec2<f32>(texSize);
  let albedoSample = textureLoad(albedoTex, pixel, 0);
  let normalRef = textureLoad(normalTex, pixel, 0).rgb;
  let depthRef = textureLoad(depthTex, pixel, 0).r;
  let shadowRef = textureLoad(intermediaryTexture, pixel, 0);

  // Temporal sampling
  let uv = (vec2<f32>(pixel) + vec2(0.5)) / vec2<f32>(texSize);
  let uvVelocity: vec2<f32> = textureLoad(velocityAndWaterTex, pixel, 0).xy * vec2(0.5, -0.5);
  let previousUv = uv - uvVelocity;
  let previousPixel = vec2<i32>(previousUv * vec2<f32>(texSize));
  var previousShadow = textureSampleLevel(previousTex, nearestSampler, previousUv, 0);

  var previousWeight = clamp(1.0 - length(previousUv), 0.0,0.9);

  // Sample depth from the Depth texture
  let depthAtPreviousPixel: f32 = textureLoad(depthTex, previousPixel, 0).r;

  // Calculate depth difference between source and history samples
  let depthDifference: f32 = abs(depthRef - depthAtPreviousPixel);

  // Apply depth clamping
  if (depthDifference > TEMPORAL_DEPTH_THRESHOLD) {
      previousWeight = 0.0;
  }

  // Clamp the history sample to the min and max of the 3x3 neighborhood
  var minCol = shadowRef;
  var maxCol = shadowRef;
  for (var x: i32 = -1; x <= 1; x = x + 1) {
      for (var y: i32 = -1; y <= 1; y = y + 1) {
          let neighbourPixel = clamp(vec2(i32(pixel.x) + x, i32(pixel.y) + y), vec2(0), vec2(i32(texSize.x - 1), i32(texSize.y - 1)));
          let s = textureLoad(intermediaryTexture, neighbourPixel, 0);
          minCol = min(minCol, s);
          maxCol = max(maxCol, s);
      }
  }
  previousShadow = clamp(previousShadow, minCol, maxCol);

  // Get variance of the 3x3 neighborhood
  let normalNeighbourhood = array<vec3<f32>, 9>(
    normalRef,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[0], 0).rgb,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[1], 0).rgb,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[2], 0).rgb,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[3], 0).rgb,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[4], 0).rgb,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[5], 0).rgb,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[6], 0).rgb,
    textureLoad(normalTex, vec2<i32>(pixel) + NEIGHBORHOOD_SAMPLE_POSITIONS[7], 0).rgb
  );

  let normalVariance = calculateVariance(normalNeighbourhood);
  let normalisedNormalVariance = normalVariance / (normalVariance + 0.0001);

  // Bilateral blur
  var outputColour = vec4<f32>(0.0);
  var totalWeight = 0.0;
  let golden_angle = 137.5; // The golden angle in degrees
  let taps = i32(pow(1.0 - normalVariance, 3.0) * 8.0);

  for(var i = 0; i <= taps; i++){
      let angle = (golden_angle * f32(i)) % 360.0;
      let radius = f32(i) * 0.5 * GOLDEN_RATIO;
      let samplePixel = vec2<i32>(pixel) + vec2<i32>(polarToCartesian(f32(angle), radius));
      let sampleUV = (vec2<f32>(samplePixel)) / vec2<f32>(texSize);
      let normalSample = textureSampleLevel(normalTex, nearestSampler, sampleUV, 0.0).rgb;
      let shadowSample = textureSampleLevel(intermediaryTexture, nearestSampler, sampleUV, 0.0);
      let normalWeight = dot(normalSample, normalRef);

      let weight =  normalWeight;
      totalWeight += weight;
      outputColour += shadowSample * weight;
  }
  outputColour /= totalWeight;
  textureStore(outputTex, pixel, mix(outputColour, previousShadow, previousWeight));
}

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let shadowRef = textureLoad(intermediaryTexture, pixel, 0);
  let albedoRef = textureLoad(albedoTex, pixel, 0);
  textureStore(outputTex, pixel,shadowRef * albedoRef);
}
