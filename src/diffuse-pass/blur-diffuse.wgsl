@group(0) @binding(0) var<uniform> resolution : vec2<u32>;
@group(0) @binding(1) var diffuseTex : texture_2d<f32>;
@group(0) @binding(2) var linearSampler : sampler;

// g-buffer
@group(1) @binding(0) var normalTex : texture_2d<f32>;
@group(1) @binding(1) var albedoTex : texture_2d<f32>;
@group(1) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(3) var depthTex : texture_2d<f32>;

const SAMPLE_RADIUS = 1;
const SAMPLE_STEP = 1;
const GAUSSIAN_SIGMA = 0.001;
const DEPTH_THRESHOLD = 1.0;

// Function to calculate the Gaussian weight
fn gaussianWeight(offset: vec2<f32>) -> f32 {
    let exponent = -dot(offset, offset) / (2.0 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA);
    return exp(exponent) / (2.0 * 3.141592653589793 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  var pixel = vec2<f32>(GlobalInvocationID.xy);
  var normalSample = textureLoad(normalTex,GlobalInvocationID.xy, 0).rgb;
  var albedoSample = textureLoad(albedoTex,GlobalInvocationID.xy, 0).rgb;
  var depthSample = textureLoad(depthTex,GlobalInvocationID.xy, 0).r;

  if(all(normalSample == vec3(0.0))) {
    textureStore(
      outputTex,
      vec2<u32>(pixel),
      vec4(normalSample,1.0),
    );
    return;
  }

  var outputSample = vec3(0.0);
  var sampleCount = 0.0;

  for(var x = -SAMPLE_RADIUS; x <= SAMPLE_RADIUS; x+=SAMPLE_STEP) {
    for(var y = -SAMPLE_RADIUS; y <= SAMPLE_RADIUS; y += SAMPLE_STEP) {
      let offset = vec2(f32(x),f32(y));
      let weight = gaussianWeight(offset / f32(SAMPLE_RADIUS));
      let currentPixel = pixel + offset;
      let currentUV = vec2<f32>(currentPixel) / vec2<f32>(resolution);
      let currentNormal = textureLoad(normalTex,vec2<u32>(currentPixel), 0).rgb;
      let isWithinDepthThreshold = abs(depthSample - textureLoad(depthTex,vec2<u32>(currentPixel), 0).r) < DEPTH_THRESHOLD;
      if(all(normalSample == currentNormal) && isWithinDepthThreshold) {
        outputSample += weight * textureSampleLevel(diffuseTex, linearSampler, currentUV, 0.0).rgb;
        sampleCount += weight;
      }
    }
  }

  outputSample /= sampleCount;
  var outputColour = outputSample * albedoSample;
  textureStore(
    outputTex,
    vec2<u32>(pixel),
    vec4(outputSample,1.0),
  );
}