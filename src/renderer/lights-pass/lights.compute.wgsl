
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
  lightIntensity: u32, //bitcast
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
const MAX_SAMPLE_COUNT = 32;

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>,
) {
  let pixel = id.xy;
  var blueNoisePixel = vec2<i32>(id.xy);

  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;
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
  let hasExceededSampleCount = pixelBuffer[pixelBufferIndex].sampleCount >= MAX_SAMPLE_COUNT;

  if(isSky || hasExceededSampleCount){
//    pixelBuffer[pixelBufferIndex].contribution = vec3(0.);
    pixelBuffer[pixelBufferIndex].weight *= 0.5;
    pixelBuffer[pixelBufferIndex].sampleCount /= 2;
    let currentIntensity = bitcast<f32>(pixelBuffer[pixelBufferIndex].lightIntensity);
    pixelBuffer[pixelBufferIndex].lightIntensity = bitcast<u32>(currentIntensity * 0.5);
    pixelBuffer[pixelBufferIndex].sampleCount = clamp(pixelBuffer[pixelBufferIndex].sampleCount / 2, 1, MAX_SAMPLE_COUNT);
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
    pixelBuffer[pixelBufferIndex].lightIntensity = bitcast<u32>(intensity);
  }
  pixelBuffer[pixelBufferIndex].sampleCount += 1;
}

// Given a pixel and 4 closest neighbors, interpolate the light
fn bilinearLightContribution(pixel: vec2<u32>, downscaledResolution: vec2<u32>) -> vec3<f32> {
  let p0 = pixel / DOWN_SAMPLE_FACTOR;
  let p1 = vec2<u32>(p0.x + 1, p0.y);
  let p2 = vec2<u32>(p0.x, p0.y + 1);
  let p3 = vec2<u32>(p0.x + 1, p0.y + 1);


  let t = fract(vec2<f32>(pixel) / vec2<f32>(DOWN_SAMPLE_FACTOR));

  let i0 = convert2DTo1D(downscaledResolution.x, p0);
  let i1 = convert2DTo1D(downscaledResolution.x, p1);
  let i2 = convert2DTo1D(downscaledResolution.x, p2);
  let i3 = convert2DTo1D(downscaledResolution.x, p3);

  let c0 = pixelBuffer[i0].contribution;
  let c1 = pixelBuffer[i1].contribution;
  let c2 = pixelBuffer[i2].contribution;
  let c3 = pixelBuffer[i3].contribution;

  let bottom = mix(c0, c1, t.x);
  let top = mix(c2, c3, t.x);
  return mix(bottom, top, t.y);
}

fn bilinearLightPosition(pixel: vec2<u32>, downscaledResolution: vec2<u32>) -> vec3<f32> {
  let p0 = pixel / DOWN_SAMPLE_FACTOR;
  let p1 = vec2<u32>(p0.x + 1, p0.y);
  let p2 = vec2<u32>(p0.x, p0.y + 1);
  let p3 = vec2<u32>(p0.x + 1, p0.y + 1);

  let t = fract(vec2<f32>(pixel) / vec2<f32>(DOWN_SAMPLE_FACTOR));

  let i0 = convert2DTo1D(downscaledResolution.x, p0);
  let i1 = convert2DTo1D(downscaledResolution.x, p1);
  let i2 = convert2DTo1D(downscaledResolution.x, p2);
  let i3 = convert2DTo1D(downscaledResolution.x, p3);

  let l0 = pixelBuffer[i0].lightIndex;
  let l1 = pixelBuffer[i1].lightIndex;
  let l2 = pixelBuffer[i2].lightIndex;
  let l3 = pixelBuffer[i3].lightIndex;

  let lp0 = lightsBuffer[l0].position;
  let lp1 = lightsBuffer[l1].position;
  let lp2 = lightsBuffer[l2].position;
  let lp3 = lightsBuffer[l3].position;

  let bottom = mix(lp0, lp1, t.x);
  let top = mix(lp2, lp3, t.x);
  return mix(bottom, top, t.y);
}


fn cubicInterpolate(p0: vec3<f32>, p1: vec3<f32>, p2: vec3<f32>, p3: vec3<f32>, t: f32) -> vec3<f32> {
  let a0 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  let a1 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  let a2 = -0.5 * p0 + 0.5 * p2;
  let a3 = p1;
  return a0 * (t * t * t) + a1 * (t * t) + a2 * t + a3;
}

fn bicubicLightContribution(pixel: vec2<u32>, downscaledResolution: vec2<u32>) -> vec3<f32> {
  let p0 = vec2<i32>(pixel) / DOWN_SAMPLE_FACTOR;

  // Sample a 4x4 neighborhood
  var samples: array<vec3<f32>, 16>;

  for (var y: i32 = -1; y <= 2; y++) {
    for (var x: i32 = -1; x <= 2; x++) {
      let samplePos = vec2<i32>(p0.x + x, p0.y + y); // TODO: clamp
      let i = convert2DTo1D(downscaledResolution.x, vec2<u32>(samplePos));
      samples[(y + 1) * 4 + (x + 1)] = pixelBuffer[i].contribution;
    }
  }

  let t = fract(vec2<f32>(pixel) / vec2<f32>(DOWN_SAMPLE_FACTOR));

  // Interpolate along x axis for each row (resulting in 4 values)
  var rowInterpolations: array<vec3<f32>, 4>;
  for (var i = 0; i < 4; i++) {
    rowInterpolations[i] = cubicInterpolate(
      samples[i * 4 + 0],
      samples[i * 4 + 1],
      samples[i * 4 + 2],
      samples[i * 4 + 3],
      t.x
    );
  }

  // Now interpolate along y axis with the results of x axis interpolation
  return cubicInterpolate(rowInterpolations[0], rowInterpolations[1], rowInterpolations[2], rowInterpolations[3], t.y);
}

@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;

  var blueNoisePixel = vec2<i32>(id.xy);
  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;
  var r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy * DOWN_SAMPLE_FACTOR;
  let jitteredPixel = vec2<u32>(vec2<i32>(pixel) + vec2<i32>(r));
  var downscaledPixel = jitteredPixel / DOWN_SAMPLE_FACTOR;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let index = convert2DTo1D(downscaledResolution.x, downscaledPixel);

  var diffuse = vec3<f32>(0.0);
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;
  var normalWeights = 0.0;

  diffuse = bilinearLightContribution(jitteredPixel, downscaledResolution);

  let lightIndex = pixelBuffer[index].lightIndex;
  let finalWeightSum = pixelBuffer[index].weight;
  let lightPosition = bilinearLightPosition(pixel, downscaledResolution);
  let finalSampleCount = pixelBuffer[index].sampleCount;
  let lightDir = normalize(lightPosition - worldPos);
  let nDotL = dot(normalRef, lightDir);
  diffuse *= nDotL;

  let viewDir = normalize(cameraPosition - worldPos);
  let halfDir = normalize(viewDir + lightDir);
  let specularStrength = 0.5;
  let shininess = 32.0;
  let specularIntensity = pow(max(dot(normalRef, halfDir), 0.0), shininess);
  let specular = specularStrength * specularIntensity * vec3<f32>(1.0);

  let lightProbability = 1.0 / f32(LIGHT_COUNT);
  diffuse = (diffuse * finalWeightSum) / (f32(finalSampleCount) * lightProbability);

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let outputColor = diffuse + inputColor + specular;
  let intensity = bitcast<f32>(pixelBuffer[index].lightIntensity);

  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(outputColor, 1.));

}