
struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
};

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

fn convert1DTo2D(width: u32, index1D: u32) -> vec2<u32> {
    return vec2<u32>(index1D % width, index1D / width);
}

struct Light {
  position: vec3<f32>,
  color: vec3<f32>,
};

struct LightConfig {
  constantAttenuation: f32,
  linearAttenuation: f32,
  quadraticAttenuation: f32,
  lightCutoff: f32
}

// 8 byte
struct Reservoir {
  sampleCount: u32,
  weightSum: f32,
  lightWeight: f32,
  lightIndex: u32,
}



fn unpackReservoir(reservoir: vec4<f32>) -> Reservoir {
    return Reservoir(
        bitcast<u32>(reservoir.x),
        reservoir.y,
        reservoir.z,
        bitcast<u32>(reservoir.w)
    );
}

@group(0) @binding(0) var nearestSampler : sampler;
@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var reservoirTex : texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var<uniform> lightConfig : LightConfig;
@group(2) @binding(0) var inputReservoirTex : texture_2d<f32>;
@group(3) @binding(0) var<uniform> viewProjections : ViewProjectionMatrices;

const QUADRATIC_ATTENUATION = 0.1;
const LIGHT_COUNT = 32;
const SAMPLES_PER_FRAME = 8;
const MAX_BINARY_SEARCH_ITERATIONS = 32;

fn binarySearchCDF(CDF: array<f32, LIGHT_COUNT>, randomValue: f32)-> u32 {
  var low = 0u;
  var high = LIGHT_COUNT - 1u;
  var iterations = 0;

  while (low < high && iterations < MAX_BINARY_SEARCH_ITERATIONS) {
    iterations += 1;
    let mid = (low + high) / 2;

    // Check if the random value is less than the current CDF midpoint
    if (randomValue < CDF[mid]) {
        high = mid; // Search the left half
    } else {
        low = mid + 1; // Search the right half
    }
  }

  // After the loop, `low` should be the index of the selected light
  return low;
}

fn getLightWeight(lightPos: vec3<f32>, lightColour: vec3<f32>, worldPos: vec3<f32>, normal: vec3<f32>) -> f32 {
  let lightDir = lightPos - worldPos;
  let d = length(lightDir);
  if(d > lightConfig.lightCutoff){
    return 0.0;
  }
  let attenuation = lightConfig.constantAttenuation + lightConfig.linearAttenuation * d + lightConfig.quadraticAttenuation * d * d;
  let ndotl = dot(normalize(lightDir), normal);
  var weight = (1.0 / attenuation) * length(lightColour) * ndotl;
  return weight;
}


fn calculateNDC(worldPos: vec3<f32>, viewProjection: mat4x4<f32>) -> vec3<f32> {
  let clipPos = viewProjection * vec4(worldPos, 1.0);
  var ndc = clipPos.xyz / clipPos.w;
  ndc.x = -ndc.x;
  ndc.y = -ndc.y;
  return ndc;
}

const WEIGHT_THRESHOLD = 0.1;

/**
  * Checkerboard pattern for % frame index 0, 1
  * Frame 0, idx 0: 0, 0
  * Frame 0, idx 1: 1, 1
  * Frame 1, idx 0: 1, 0
  * Frame 1, idx 1: 0, 1
  */
@compute @workgroup_size(8, 8, 2)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>,
    @builtin(local_invocation_id) localId : vec3<u32>,
) {
  let isEvenFrame = time.frame % 2 == 0;
  var kernelX = localId.z % 2;
  var kernelY = localId.z % 2;
  if(!isEvenFrame){
    kernelX = 1 - localId.z % 2;
  }

//  let originPixel = id.xy * 2 + vec2(time.frame % 2, (time.frame % 4) / 2);
  let originPixel = id.xy * 2;
  let offsetPixel = originPixel + vec2<u32>(kernelX, kernelY);

  let gBufferPixel = offsetPixel * 2;
  let worldPos = textureLoad(worldPosTex, gBufferPixel, 0).xyz;
  let normal = textureLoad(normalTex, gBufferPixel, 0).xyz;

  var blueNoisePixel = vec2<i32>(offsetPixel);
  let frameOffsetX = (i32(time.frame) * 92821 + 71413);  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 512);    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;

  var importance = array<f32, LIGHT_COUNT>();
  var CDF = array<f32, LIGHT_COUNT>();

  // Calculate importance values based on intensity and distance
  for (var i = 0; i < LIGHT_COUNT; i++) {
      let light = lightsBuffer[i];
      let lightPos = light.position + randomInUnitSphere(r);
      importance[i] = getLightWeight(lightPos, light.color, worldPos, normal);
  }

  // Normalize and create CDF
  var totalImportance = 0.0;
  for (var i = 0; i < LIGHT_COUNT; i++) {
      totalImportance += importance[i];
  }
  for (var i = 0; i < LIGHT_COUNT; i++) {
    if(i == 0){
      CDF[i] = importance[i] / totalImportance;
    } else {
      CDF[i] = CDF[i - 1] + importance[i] / totalImportance;
    }
  }

  var bestWeight = 0.0;
  var weightSum = 0.0;
  var lightIndex = 100000u;
  var sampleCount = 0u;
  for(var i = 0; i < SAMPLES_PER_FRAME; i++){
    let iterOffsetX = (i * 193); // Large prime numbers for frame variation
    let iterOffsetY = (i * 257); // Different prime numbers
    let sampleR = textureLoad(blueNoiseTex, (blueNoisePixel + vec2(iterOffsetX, iterOffsetY)) % 512, 0).xy;
    let sampleLightIndex = binarySearchCDF(CDF, sampleR.y);
    let light = lightsBuffer[sampleLightIndex];
    let weight = getLightWeight(light.position + randomInUnitSphere(r), light.color, worldPos, normal);
    weightSum += weight;
    sampleCount++;

    if(r.y < weight / weightSum){
      lightIndex = sampleLightIndex;
      bestWeight = weight;
    }
  }

  let light = lightsBuffer[lightIndex];
  let lightPos = light.position + randomInUnitSphere(r);
  let lightDir = lightPos - worldPos;

  var currentReservoir = unpackReservoir(textureLoad(inputReservoirTex, offsetPixel, 0));
  var weightDifference = abs(bestWeight - currentReservoir.lightWeight);

  if(weightDifference > WEIGHT_THRESHOLD){
    currentReservoir = Reservoir(0, 0.0, 0.0, 0);
  }

  let raymarchResult = rayMarchBVHFirstHit(worldPos + normal * 0.001, normalize(lightDir));
  if(raymarchResult.hit){
      bestWeight = 0.0;
  }

//  sampleCount += currentReservoir.sampleCount;
//  weightSum += currentReservoir.weightSum;

  // Resample last frames pixel afterwards to better account for occlusion from raycast hit
//  if(r.y < currentReservoir.lightWeight / weightSum){
//    lightIndex = currentReservoir.lightIndex;
//    bestWeight = currentReservoir.lightWeight;
//  }

  var reservoir = vec4(
    bitcast<f32>(SAMPLES_PER_FRAME),
     weightSum,
     bestWeight,
     bitcast<f32>(lightIndex),
  );

  textureStore(reservoirTex, offsetPixel, reservoir);
}