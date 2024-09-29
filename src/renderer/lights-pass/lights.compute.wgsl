
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
  maxSampleCount: f32,
}


struct LightPixel {
  sampleCount: u32,
  weight: f32,
  contribution: vec3<f32>,
  lightIndex: u32,
}

@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<LightPixel>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;


@group(1) @binding(0) var<uniform> lightConfig : LightConfig;

const INTENSITY_ANTI_QUANTIZATION_FACTOR = 255.0;
const CONSTANT_ATTENUATION = 0.0;
const LINEAR_ATTENUATION = 0.1;
const QUADRATIC_ATTENUATION = 0.1;
const LIGHT_COUNT = 25;

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>,
) {
  let pixel = id.xy;
  var blueNoisePixel = vec2<i32>(id.xy);
  blueNoisePixel.x += i32(time.frame) * 32;
  blueNoisePixel.y += i32(time.frame) * 16;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;

  let lightIndex = u32(r.x * f32(LIGHT_COUNT));

  // alternate through 4x4 grid of pixels based on frame index
  let frameIndex = time.frame % (DOWN_SAMPLE_FACTOR * DOWN_SAMPLE_FACTOR);
  let x = frameIndex % DOWN_SAMPLE_FACTOR;
  let y = frameIndex / DOWN_SAMPLE_FACTOR;
  let downscaledPixelOrigin = vec2<u32>(id.xy) * DOWN_SAMPLE_FACTOR;
  let downscaledPixel = downscaledPixelOrigin + vec2<u32>(x, y);
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let worldPos = textureLoad(worldPosTex, downscaledPixel, 0).xyz;
  let normal = textureLoad(normalTex, downscaledPixel, 0).xyz;

  let light = lightsBuffer[lightIndex];
  let jitteredLightPosition = light.position + randomInUnitSphere(r);

  let lightDir = jitteredLightPosition - worldPos;
  let d = length(lightDir);

  let attenuation = lightConfig.constantAttenuation + lightConfig.linearAttenuation * d + lightConfig.quadraticAttenuation * d * d;
  var intensity = (1.0 / attenuation) * length(light.color);

  let pixelBufferIndex = convert2DTo1D(downscaledResolution.x, pixel);

  let isSky = distance(worldPos, cameraPosition) > 10000.0;
  let hasExceededSampleCount = pixelBuffer[pixelBufferIndex].sampleCount >= 64;

  if(isSky || hasExceededSampleCount){
    pixelBuffer[pixelBufferIndex].contribution *= 0.1;
    pixelBuffer[pixelBufferIndex].weight *= 0.1;
    pixelBuffer[pixelBufferIndex].sampleCount /= 9;
    return;
  }

  let raymarchResult = rayMarchBVH(worldPos + normal * 0.001, normalize(lightDir));

  if(raymarchResult.hit){
      intensity = 0.0;
  }

  let newWeight = intensity;
  let currentWeight = pixelBuffer[pixelBufferIndex].weight;
  if(newWeight > currentWeight){
    pixelBuffer[pixelBufferIndex].weight = newWeight;
    pixelBuffer[pixelBufferIndex].contribution = intensity * normalize(light.color);
    pixelBuffer[pixelBufferIndex].lightIndex = lightIndex;
  }
  pixelBuffer[pixelBufferIndex].sampleCount += 1;
}


@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  var downscaledPixel = pixel / DOWN_SAMPLE_FACTOR;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let index = convert2DTo1D(downscaledResolution.x, downscaledPixel);

  var c = vec3<f32>(0.0);
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;
  var normalWeights = 0.0;

  for(var x = -1; x <= 1; x++){
    for(var y = -1; y <= 1; y++){
      let offset = vec2<i32>(x, y);
      let neighbor = vec2<i32>(downscaledPixel) + offset;
      let neighborIndex = convert2DTo1D(downscaledResolution.x,vec2<u32>(neighbor));
      let neighborNormal = textureLoad(normalTex, vec2<u32>(neighbor) * DOWN_SAMPLE_FACTOR, 0).xyz;
      let normalDiff = dot(normalRef, neighborNormal);
      let normalWeight = normalDiff + 1.0;
      let bilinearWeight = 1.0 / (1.0 + f32(x * x + y * y));
      let neighborContribution = pixelBuffer[neighborIndex].contribution;

      let sampleWeight = bilinearWeight * normalWeight;
      normalWeights += sampleWeight;
      c += neighborContribution * sampleWeight;
    }
  }

  let lightIndex = pixelBuffer[index].lightIndex;
  let lightPosition = lightsBuffer[lightIndex].position;
  let lightDir = normalize(lightPosition - worldPos);
  let nDotL = dot(normalRef, lightDir);
  c /= normalWeights;

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let weight = pixelBuffer[index].weight;
  let totalColor = pixelBuffer[index].contribution;
  let outputColor = (c * nDotL) + inputColor;


  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(outputColor, 1.));

}