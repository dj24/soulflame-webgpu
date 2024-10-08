@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<LightPixel>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var velocityTex : texture_2d<f32>;
@group(1) @binding(1) var<storage, read> previousPixelBuffer : array<LightPixel>;
@group(1) @binding(2) var depthTex : texture_2d<f32>;

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

struct LightPixel {
  sampleCount: u32,
  weight: f32,
  contribution: vec3<f32>,
  lightIndex: u32,
}

const DISTANCE_THRESHOLD = 100.0;
const WEIGHT_THRESHOLD = 100.0;

// Given a pixel and 4 closest neighbors, interpolate the light
fn bilinearLightContribution(pixel: vec2<f32>, resolution: vec2<u32>) -> vec3<f32> {
  let p0 = vec2<u32>(pixel);
  let p1 = vec2(p0.x + 1, p0.y);
  let p2 = vec2(p0.x, p0.y + 1);
  let p3 = vec2(p0.x + 1, p0.y + 1);

  let t = fract(pixel);

  let i0 = convert2DTo1D(resolution.x, p0);
  let i1 = convert2DTo1D(resolution.x, p1);
  let i2 = convert2DTo1D(resolution.x, p2);
  let i3 = convert2DTo1D(resolution.x, p3);

  let c0 = previousPixelBuffer[i0].contribution;
  let c1 = previousPixelBuffer[i1].contribution;
  let c2 = previousPixelBuffer[i2].contribution;
  let c3 = previousPixelBuffer[i3].contribution;

  let bottom = mix(c0, c1, t.x);
  let top = mix(c2, c3, t.x);
  return mix(bottom, top, t.y);
}

fn bilinearReservoirWeight(pixel: vec2<f32>, resolution: vec2<u32>) -> f32 {
  let p0 = vec2<u32>(pixel);
  let p1 = vec2<u32>(p0.x + 1, p0.y);
  let p2 = vec2<u32>(p0.x, p0.y + 1);
  let p3 = vec2<u32>(p0.x + 1, p0.y + 1);

  let t = fract(pixel);

  let i0 = convert2DTo1D(resolution.x, p0);
  let i1 = convert2DTo1D(resolution.x, p1);
  let i2 = convert2DTo1D(resolution.x, p2);
  let i3 = convert2DTo1D(resolution.x, p3);

  let w0 = previousPixelBuffer[i0].weight;
  let w1 = previousPixelBuffer[i1].weight;
  let w2 = previousPixelBuffer[i2].weight;
  let w3 = previousPixelBuffer[i3].weight;

  let bottom = mix(w0, w1, t.x);
  let top = mix(w2, w3, t.x);
  return mix(bottom, top, t.y);
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

const DEPTH_THRESHOLD : f32 = 1.0;

@compute @workgroup_size(8,8,1)
fn main(
@builtin(global_invocation_id) id : vec3<u32>
){
  var downscaledPixel = id.xy;
  let resolution = textureDimensions(inputTex);
  let downscaledResolution = resolution / DOWN_SAMPLE_FACTOR;
  var pixel = vec2<f32>(downscaledPixel) * f32(DOWN_SAMPLE_FACTOR);
  let uv = vec2<f32>(downscaledPixel) / vec2<f32>(downscaledResolution);
//  if(uv.x < 0.5){
//    return;
//  }


  let velocity = textureLoad(velocityTex, vec2<u32>(pixel), 0).xy;
  let pixelVelocity = velocity * vec2<f32>(resolution);
  let previousPixel = vec2<f32>(pixel) - pixelVelocity;
//
//  let normalRef = textureLoad(normalTex, vec2<u32>(pixel), 0).xyz;
//  let previousNormal = textureLoad(normalTex, vec2<u32>(previousPixel), 0).xyz;
//  let normalDifference = -dot(normalRef, previousNormal);
//  if(normalDifference > 0.5){
//    return;
//  }


  // Calculate depth difference between source and history samples
//  let depthAtPreviousPixel = textureLoad(depthTex, vec2<u32>(previousPixel), 0).r;
//  let depthDifference: f32 = abs(depthSample - depthAtPreviousPixel);
//
//  // Apply depth clamping
//  if (depthDifference > DEPTH_THRESHOLD) {
//      return;
//  }
//

  let previousDownscaledPixel = previousPixel / f32(DOWN_SAMPLE_FACTOR);
  let index = convert2DTo1D(downscaledResolution.x, downscaledPixel);
  let previousIndex = convert2DTo1D(downscaledResolution.x, vec2<u32>(previousDownscaledPixel));
  var previousLightPixel = previousPixelBuffer[previousIndex];
  let previousCount = previousLightPixel.sampleCount;
  let previousWeight = bilinearReservoirWeight(previousDownscaledPixel, downscaledResolution);
  let previousLightContribution = bilinearLightContribution(previousDownscaledPixel, downscaledResolution);

//  if(abs(previousWeight - pixelBuffer[index].weight) > WEIGHT_THRESHOLD){
//    return;
//  }

  var currentWeight = pixelBuffer[index].weight;
  var currentContribution = pixelBuffer[index].contribution;
  var currentSampleCount = pixelBuffer[index].sampleCount;

  if(previousWeight > pixelBuffer[index].weight){
    let totalWeight = pixelBuffer[index].weight + previousWeight;
    let normalizedPreviousWeight = previousWeight / totalWeight;
    currentContribution = mix(currentContribution, previousLightContribution, normalizedPreviousWeight);
    currentWeight = totalWeight;
    pixelBuffer[index].lightIndex = previousLightPixel.lightIndex;
    currentSampleCount += previousCount;
  }

  if(currentSampleCount > MAX_SAMPLES){
    let decayFactor = f32(MAX_SAMPLES) / f32(currentSampleCount);
    currentContribution *= decayFactor;
    currentWeight *= decayFactor;
    currentSampleCount = MAX_SAMPLES;
  }

  pixelBuffer[index].contribution = currentContribution;
  pixelBuffer[index].weight = currentWeight;
  pixelBuffer[index].sampleCount = currentSampleCount;
}
