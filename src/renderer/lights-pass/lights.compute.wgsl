
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
  weights: f32,
  colour: vec3<f32>,
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

  let lightIndex = i32(r.x * f32(LIGHT_COUNT));
  let downscaledPixel = vec2<u32>(id.xy) * DOWN_SAMPLE_FACTOR;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let worldPos = textureLoad(worldPosTex, downscaledPixel, 0).xyz;
  let normal = textureLoad(normalTex, downscaledPixel, 0).xyz;

  let light = lightsBuffer[lightIndex];
  let jitteredLightPosition = light.position + randomInUnitSphere(r);

  let lightDir = jitteredLightPosition - worldPos;
  let d = length(lightDir);

  let attenuation = lightConfig.constantAttenuation + lightConfig.linearAttenuation * d + lightConfig.quadraticAttenuation * d * d;
  let intensity = 1.0 / attenuation;

  let pixelBufferIndex = convert2DTo1D(downscaledResolution.x, pixel);

  let isSky = distance(worldPos, cameraPosition) > 10000.0;
  let hasExceededSampleCount = pixelBuffer[pixelBufferIndex].sampleCount >= 16;

  if(isSky || hasExceededSampleCount){
    pixelBuffer[pixelBufferIndex].colour = vec3(0.0);
    pixelBuffer[pixelBufferIndex].weights = 0.0;
    pixelBuffer[pixelBufferIndex].sampleCount = 1;
    return;
  }

  let raymarchResult = rayMarchBVH(worldPos + normal * 0.001, normalize(lightDir));

  if(raymarchResult.hit){
      return;
  }

  let NdotL = max(dot(normalize(normal), normalize(lightDir)), 0.0);
  let weight = 1.0 / (intensity * NdotL);
  pixelBuffer[pixelBufferIndex].colour += light.color / weight;
  pixelBuffer[pixelBufferIndex].weights += weight;
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

  // Bilinear filtering
  // TODO: select best sample instead usig dot product of normals
  let f = fract(vec2<f32>(pixel) / f32(DOWN_SAMPLE_FACTOR));

  let p0 = vec2(downscaledPixel);
  let p1 = vec2(downscaledPixel.x + 1, downscaledPixel.y);
  let p2 = vec2(downscaledPixel.x, downscaledPixel.y + 1);
  let p3 = vec2(downscaledPixel.x + 1, downscaledPixel.y + 1);

  let c0 = pixelBuffer[convert2DTo1D(downscaledResolution.x, p0)].colour;
  let c1 = pixelBuffer[convert2DTo1D(downscaledResolution.x, p1)].colour;
  let c2 = pixelBuffer[convert2DTo1D(downscaledResolution.x, p2)].colour;
  let c3 = pixelBuffer[convert2DTo1D(downscaledResolution.x, p3)].colour;

  let c0c1 = mix(c0, c1, f.x);
  let c2c3 = mix(c2, c3, f.x);

  let colour = mix(c0c1, c2c3, f.y);

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let weights = pixelBuffer[index].weights;
  let totalColor = pixelBuffer[index].colour;
  let sampleCount = pixelBuffer[index].sampleCount;
  let outputColor = (colour) + inputColor;


  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(outputColor, 1.0));

}