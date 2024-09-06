const SUN_COLOR = vec3(0.6,0.5,0.4) * 20.0;
const MOON_COLOR = vec3<f32>(0.5, 0.5, 1.0);
const MIN_RADIANCE = 0.0;
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
const SHADOW_ACNE_OFFSET: f32 = 0.01;
const SCATTER_AMOUNT: f32 = 0.01;
const POSITION_SCATTER_AMOUNT: f32 = 0.00;

// TODO: offset in object space instead of world space to scale with object size
fn diffuseRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>, normal: vec3<f32>, voxelObjectSize: f32) -> bool {
  let rayOrigin = worldPos;
  return rayMarchBVH(rayOrigin, shadowRayDirection).hit;
}

fn calculateNDC(worldPos: vec3<f32>, viewProjection: mat4x4<f32>) -> vec3<f32> {
  let clipPos = viewProjection * vec4(worldPos, 1.0);
  return clipPos.xyz / clipPos.w;
}

fn calculateNDCDirection(worldDirection: vec3<f32>, viewProjection: mat4x4<f32>) -> vec3<f32> {
  let clipDirection = viewProjection * vec4(worldDirection, 0.0);
  return clipDirection.xyz / clipDirection.w;
}

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>, normal: vec3<f32>) -> bool {
  let rayOrigin = worldPos + normal * SHADOW_ACNE_OFFSET;
  return rayMarchBVH(rayOrigin, shadowRayDirection).hit;
}

struct Light {
  direction: vec3<f32>,
  colour: vec3<f32>,
};

struct BufferRay {
  pixel : vec2<u32>,
  direction : vec3<f32>,
  origin : vec3<f32>,
  lightColour : vec3<f32>,
};

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

fn tracePixel(outputPixel:vec2<i32>, downscaleFactor: i32, blueNoiseOffset: vec2<i32>) -> vec3<f32>{
  let pixel = outputPixel * downscaleFactor;
  let albedoRef = textureLoad(albedoTex, pixel, 0);
  var normalSample = textureLoad(normalTex, pixel, 0).rgb;
  let worldPosSample = textureLoad(worldPosTex, pixel, 0);
  let uv = vec2<f32>(pixel) / vec2<f32>(textureDimensions(outputTex));

  let distanceToSurface = length(worldPosSample.rgb - cameraPosition);
  var worldPos = worldPosSample.rgb;

  var samplePixel = pixel;
  samplePixel.x += i32(time.frame) * 32;
  samplePixel.y += i32(time.frame) * 16;
  var blueNoisePixel = ((samplePixel / downscaleFactor) + blueNoiseOffset) % BLUE_NOISE_SIZE;
  if(time.frame % 2 == 0){
    blueNoisePixel.y = BLUE_NOISE_SIZE - blueNoisePixel.y;
  }
  if(time.frame % 3 == 0){
    blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
  }
  var r = textureLoad(blueNoiseTex, blueNoisePixel, 0).rg;

  let maxSunIntensity = vec3(128.0);
  // TODO: push to buffer instead and evaluate in a separate pass

  let shadowRayDirection = normalize(sunDirection + randomInCosineWeightedHemisphere(r, sunDirection) * SCATTER_AMOUNT);

  let isInShadow = shadowRay(worldPos, shadowRayDirection, normalSample);

  let inputRef = textureLoad(inputTex, pixel, 0);

  if(isInShadow){
    return inputRef.rgb;
  }

  return SUN_COLOR;
}

@compute @workgroup_size(16, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let result = tracePixel(pixel, 1, vec2(0));
  textureStore(outputTex, pixel, vec4(result, 1.0));
}


@group(1) @binding(0) var<storage, read_write> shadowRayBuffer : array<vec2<u32>>;

// 2x2 grid of offsets
const RAY_OFFSETS = array<vec2<u32>, 4>(
  vec2<u32>(0,0),
  vec2<u32>(1, 0),
  vec2<u32>(0, 1),
  vec2<u32>(1, 1)
);

@compute @workgroup_size(128, 1, 1)
fn bufferMarch(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
) {
  let bufferIndex = GlobalInvocationID.x / 4;
  let localRayIndex = GlobalInvocationID.x % 4;
  let pixel = shadowRayBuffer[bufferIndex];
  let offsetPixel = pixel + RAY_OFFSETS[localRayIndex];
  let result = tracePixel(vec2<i32>(offsetPixel), 1, vec2(0));
  textureStore(outputTex, offsetPixel, vec4(result, 1.0));
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
        var diff = length(neighborhood[i] - mean);
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

const DEPTH_SENSITIVITY = 10000.0;
const BLUR_RADIUS = 2.0;
const GOLDEN_RATIO = 1.61803398875;

@compute @workgroup_size(16, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = vec2<i32>(GlobalInvocationID.xy);
  let shadowRef = textureLoad(intermediaryTexture, pixel, 0);
  let albedoRef = textureLoad(albedoTex, pixel, 0);
  let inputRef = textureLoad(inputTex, pixel, 0);

  textureStore(outputTex, pixel, shadowRef * albedoRef + inputRef);
}
