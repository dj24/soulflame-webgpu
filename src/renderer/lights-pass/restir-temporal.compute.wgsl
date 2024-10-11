@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<Reservoir>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var velocityTex : texture_2d<f32>;
@group(1) @binding(1) var<storage, read> previousPixelBuffer : array<Reservoir>;
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

struct Reservoir {
  sampleCount: u32,
  weightSum: f32,
  lightWeight: f32,
  lightIndex: u32,
}

const DISTANCE_THRESHOLD = 100.0;
const WEIGHT_THRESHOLD = 100.0;

// x = weight, y = weightSum
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

  let w0 = previousPixelBuffer[i0].lightWeight;
  let w1 = previousPixelBuffer[i1].lightWeight;
  let w2 = previousPixelBuffer[i2].lightWeight;
  let w3 = previousPixelBuffer[i3].lightWeight;

  let bottom = mix(w0, w1, t.x);
  let top = mix(w2, w3, t.x);
  return mix(bottom, top, t.y);
}

fn bilinearReservoirWeightSum(pixel: vec2<f32>, resolution: vec2<u32>) -> f32 {
   let p0 = vec2<u32>(pixel);
   let p1 = vec2<u32>(p0.x + 1, p0.y);
   let p2 = vec2<u32>(p0.x, p0.y + 1);
   let p3 = vec2<u32>(p0.x + 1, p0.y + 1);

   let t = fract(pixel);

   let i0 = convert2DTo1D(resolution.x, p0);
   let i1 = convert2DTo1D(resolution.x, p1);
   let i2 = convert2DTo1D(resolution.x, p2);
   let i3 = convert2DTo1D(resolution.x, p3);

   let w0 = previousPixelBuffer[i0].weightSum;
   let w1 = previousPixelBuffer[i1].weightSum;
   let w2 = previousPixelBuffer[i2].weightSum;
   let w3 = previousPixelBuffer[i3].weightSum;

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
  var pixel = (vec2<f32>(downscaledPixel)) * f32(DOWN_SAMPLE_FACTOR);
  let velocity = textureLoad(velocityTex, vec2<u32>(pixel), 0).xy;
  let pixelVelocity = velocity * vec2<f32>(resolution);
  let previousPixel = vec2<f32>(pixel) - pixelVelocity;
  let previousWorldPos = textureLoad(worldPosTex, vec2<u32>(previousPixel), 0);
  if(previousWorldPos.w > 10000.0){
    return;
  }

  let previousDownscaledPixel = previousPixel / f32(DOWN_SAMPLE_FACTOR);
  let index = convert2DTo1D(downscaledResolution.x, downscaledPixel);
  let previousIndex = convert2DTo1D(downscaledResolution.x, vec2<u32>(previousDownscaledPixel));
  var previousLightPixel = previousPixelBuffer[previousIndex];
  let previousCount = previousLightPixel.sampleCount;
  let previousWeight = bilinearReservoirWeight(previousDownscaledPixel, downscaledResolution);
  let previousWeightSum = bilinearReservoirWeightSum(previousDownscaledPixel, downscaledResolution);

  var currentWeightSum = pixelBuffer[index].weightSum;
  var currentWeight = pixelBuffer[index].lightWeight;
  var currentSampleCount = pixelBuffer[index].sampleCount;

  var blueNoisePixel = vec2<i32>(id.xy);
  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;

  currentSampleCount += previousCount;
  currentWeightSum += previousWeight;
  if(r.y < previousWeight / currentWeightSum){
    currentWeight = previousWeight;
    pixelBuffer[index].lightIndex = previousLightPixel.lightIndex;
  }

  if(currentSampleCount > MAX_SAMPLES){
    let decayFactor = f32(MAX_SAMPLES) / f32(currentSampleCount);
    currentWeightSum *= decayFactor;
    currentWeight *= decayFactor;
    currentSampleCount = MAX_SAMPLES;
  }

  pixelBuffer[index].lightWeight = currentWeight;
  pixelBuffer[index].weightSum = currentWeightSum;
  pixelBuffer[index].sampleCount = currentSampleCount;
}
