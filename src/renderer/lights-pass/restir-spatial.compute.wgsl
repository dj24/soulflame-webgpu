@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> outputPixelBuffer : array<Reservoir>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var<storage, read> inputPixelBuffer : array<Reservoir>;

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

fn convert1DTo2D(width: u32, index1D: u32) -> vec2<u32> {
    return vec2<u32>(index1D % width, index1D / width);
}


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

struct Light {
  position: vec3<f32>,
  color: vec3<f32>,
};

struct Reservoir {
  sampleCount: u32,
  weightSum: f32,
  lightWeight: vec3<f32>,
  lightIndex: u32,
}

const NEIGHBOUR_OFFSETS = array<vec2<i32>, 8>(
  vec2<i32>(-1, 0),
  vec2<i32>(1, 0),
  vec2<i32>(0, -1),
  vec2<i32>(0, 1),
  vec2<i32>(-1, -1),
  vec2<i32>(1, -1),
  vec2<i32>(-1, 1),
  vec2<i32>(1, 1)
);

const SAMPLE_RADIUS = 1;
const MAX_WEIGHT = 1.0;
const WEIGHT_THRESHOLD = 50.0;

@compute @workgroup_size(8,8,1)
fn spatial(
@builtin(global_invocation_id) id : vec3<u32>
){
  var downscaledPixel = id.xy;
  let pixel = downscaledPixel * DOWN_SAMPLE_FACTOR;
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let index = convert2DTo1D(downscaledResolution.x, id.xy);
  let uv = (vec2<f32>(downscaledPixel) + vec2(0.5)) / vec2<f32>(downscaledResolution);
  let worldPos = textureLoad(worldPosTex, vec2<u32>(pixel), 0).xyz;

  if(distance(cameraPosition, worldPos) > 10000.0){
    return;
  }

  var weightSum = outputPixelBuffer[index].weightSum;
  var currentWeight = outputPixelBuffer[index].lightWeight;
  var currentSampleCount = outputPixelBuffer[index].sampleCount;
  var lightIndex = outputPixelBuffer[index].lightIndex;

  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  //  blueNoisePixel.x += frameOffsetX;
  //  blueNoisePixel.y += frameOffsetY;

  for(var i = 0u; i < 8; i = i + 1u){
    let offset = NEIGHBOUR_OFFSETS[i];
    let neighbor = vec2<i32>(downscaledPixel) + offset;
    let neighborIndex = convert2DTo1D(downscaledResolution.x,vec2<u32>(neighbor));
    let neighborWeight = inputPixelBuffer[neighborIndex].lightWeight.x;
    let neighborWeightSum = inputPixelBuffer[neighborIndex].weightSum;
    let neighborCount = inputPixelBuffer[neighborIndex].sampleCount;
    let normalSample = textureLoad(normalTex, vec2<u32>(neighbor) * DOWN_SAMPLE_FACTOR, 0).xyz;
    let normalDifference = dot(normalRef, normalSample);
    if(normalDifference < 0.5){
      continue;
    }
    if (abs(neighborWeightSum - weightSum) > WEIGHT_THRESHOLD) {
      continue; // Skip neighbors with too large weight difference
    }
    let iterOffsetX = (i * 193) % 512; // Large prime numbers for frame variation
    let iterOffsetY = (i * 257) % 512; // Different prime numbers
    let sampleR = textureLoad(blueNoiseTex, (vec2<i32>(downscaledPixel) + vec2(frameOffsetX, frameOffsetY)) % 512, 0).xy;

    weightSum += neighborWeight;
    currentSampleCount += neighborCount;
    if(sampleR.y < neighborWeight / weightSum){
        lightIndex = inputPixelBuffer[neighborIndex].lightIndex;
        currentWeight = vec3(neighborWeight);
    }
  }
  outputPixelBuffer[index].weightSum = weightSum;
  outputPixelBuffer[index].lightWeight = currentWeight;
  outputPixelBuffer[index].sampleCount = currentSampleCount;
  outputPixelBuffer[index].lightIndex = lightIndex;
}
