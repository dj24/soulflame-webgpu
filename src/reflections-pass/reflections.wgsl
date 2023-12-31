@group(0) @binding(0) var reflectionsStore : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var skyTex : texture_cube<f32>;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;
@group(0) @binding(3) var reflectionsTex : texture_2d<f32>;
@group(0) @binding(4) var linearSampler : sampler;
@group(0) @binding(5) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(6) var pointSampler : sampler;
@group(0) @binding(7) var<uniform> downscaleFactor : f32;

// g-buffer
@group(1) @binding(0) var normalTex : texture_2d<f32>;
@group(1) @binding(1) var albedoTex : texture_2d<f32>;
@group(1) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;

const PI = 3.14159265359;

@compute @workgroup_size(8, 8, 1)
fn getReflections(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  let downscaledResolution = vec2<u32>(vec2<f32>(resolution) / downscaleFactor);
  let pixel = vec2<u32>(GlobalInvocationID.x, downscaledResolution.y - GlobalInvocationID.y);
  let centerOfPixel = vec2<f32>(pixel) + vec2<f32>(0.5);
  let uv = centerOfPixel / vec2<f32>(downscaledResolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  let normalSample = textureLoad(normalTex, pixel, 0).rgb;
  let randomDirection = mix(normalSample,randomInHemisphere(uv, normalSample),SCATTER_AMOUNT);
  var reflectionDirection = reflect(-rayDirection, randomDirection);
  reflectionDirection = vec3(-reflectionDirection.x, reflectionDirection.y, -reflectionDirection.z);
  let skySample = textureSampleLevel(skyTex, pointSampler, reflectionDirection, 0.0);
  textureStore(
    reflectionsStore,
    pixel,
    skySample
  );
}

// TODO: dynamic blur based on scatter amouint from brdf
const SCATTER_AMOUNT = 0.005;
const SAMPLE_RADIUS = 2;
const GAUSSIAN_SIGMA = 1.0;

// Function to calculate the Gaussian weight
fn gaussianWeight(offset: vec2<f32>) -> f32 {
    let exponent = -dot(offset, offset) / (2.0 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA);
    return exp(exponent) / (2.0 * 3.141592653589793 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA);
}

@compute @workgroup_size(8, 8, 1)
fn applyReflections(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  let pixel = vec2<u32>(GlobalInvocationID.x, resolution.y - GlobalInvocationID.y);
  let centerOfPixel = vec2<f32>(pixel) + vec2<f32>(0.5);
  let uv = centerOfPixel / vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var normalSample = textureSampleLevel(normalTex,pointSampler, uv, 0.0).rgb;
  var albedoSample = textureSampleLevel(albedoTex,pointSampler, uv, 0.0).rgb;
  var foo = textureSampleLevel(albedoTex,linearSampler, uv, 0.0);
  if(all(normalSample == vec3(0.0))) {
    textureStore(
      outputTex,
      pixel,
      vec4(albedoSample, 1.0),
    );
    return;
  }

  var reflectionsSample = vec3(0.0);
  let downscaledPixel = vec2<i32>(centerOfPixel / downscaleFactor);
  let centerOfDownscaledPixel = vec2<f32>(downscaledPixel) - vec2<f32>(1.0);
  var sampleCount = 0.0;

  for(var x = -SAMPLE_RADIUS; x <= SAMPLE_RADIUS; x++) {
    for(var y = -SAMPLE_RADIUS; y <= SAMPLE_RADIUS; y ++) {
      let offset = vec2(f32(x),f32(y));
      let weight = gaussianWeight(offset / f32(SAMPLE_RADIUS));
      let currentPixel = centerOfDownscaledPixel + offset;
      let currentUV = vec2<f32>(currentPixel) / vec2<f32>(resolution / u32(downscaleFactor));
      let currentNormal = textureSampleLevel(normalTex,pointSampler, currentUV, 0.0).rgb;
      if(all(normalSample == currentNormal)){
        reflectionsSample += weight * textureSampleLevel(reflectionsTex,pointSampler, currentUV, 0.0).rgb;
        sampleCount += weight;
      }
    }
  }


  reflectionsSample /= f32(sampleCount);

  textureStore(
    outputTex,
    pixel,
    vec4(reflectionsSample * albedoSample,1.0),
  );
}