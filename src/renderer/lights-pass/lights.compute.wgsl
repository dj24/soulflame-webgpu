
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
const LIGHT_COUNT = 32;
const SAMPLES_PER_FRAME = 8;

fn getLightWeight(lightPos: vec3<f32>, lightColour: vec3<f32>, worldPos: vec3<f32>) -> f32 {
  let lightDir = lightPos - worldPos;
  let d = length(lightDir);
  let attenuation = lightConfig.constantAttenuation + lightConfig.linearAttenuation * d + lightConfig.quadraticAttenuation * d * d;
  return (1.0 / attenuation) * length(lightColour);
}

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>,
) {
  let pixel = id.xy;
  var blueNoisePixel = vec2<i32>(id.xy);
  let downscaledPixel = vec2<u32>(id.xy) * DOWN_SAMPLE_FACTOR;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let worldPos = textureLoad(worldPosTex, downscaledPixel, 0).xyz;
  let normal = textureLoad(normalTex, downscaledPixel, 0).xyz;
  let pixelBufferIndex = convert2DTo1D(downscaledResolution.x, pixel);

  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;
  let jitterOffset = randomInUnitSphere(r);

  var bestWeight = 0.0;
  var lightIndex = 0u;
  for(var i = 0; i < SAMPLES_PER_FRAME; i++){
    let iterOffsetX = (i * 193) % 512; // Large prime numbers for frame variation
    let iterOffsetY = (i * 257) % 512; // Different prime numbers
    let sampleR = textureLoad(blueNoiseTex, (blueNoisePixel + vec2(iterOffsetX, iterOffsetY)) % 512, 0).xy;
    let sampleLightIndex = u32(sampleR.x * f32(LIGHT_COUNT));
    let light = lightsBuffer[sampleLightIndex];
    let lightPos = light.position + jitterOffset;
    var weight = getLightWeight(lightPos, light.color, worldPos);

    if(weight > bestWeight){
      bestWeight = weight;
      lightIndex = sampleLightIndex;
    }
  }

  let light = lightsBuffer[lightIndex];
  let lightDir = light.position + jitterOffset - worldPos;

  let raymarchResult = rayMarchBVH(worldPos + normal * 0.001, normalize(lightDir));
  if(raymarchResult.hit){
      bestWeight *= 0.1;
  }

  pixelBuffer[pixelBufferIndex].weight = bestWeight;
  pixelBuffer[pixelBufferIndex].contribution = bestWeight * normalize(light.color);
  pixelBuffer[pixelBufferIndex].lightIndex = lightIndex;
  pixelBuffer[pixelBufferIndex].sampleCount = SAMPLES_PER_FRAME;
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

fn bilinearReservoirWeight(pixel: vec2<u32>, downscaledResolution: vec2<u32>) -> f32 {
  let p0 = pixel / DOWN_SAMPLE_FACTOR;
  let p1 = vec2<u32>(p0.x + 1, p0.y);
  let p2 = vec2<u32>(p0.x, p0.y + 1);
  let p3 = vec2<u32>(p0.x + 1, p0.y + 1);

  let t = fract(vec2<f32>(pixel) / vec2<f32>(DOWN_SAMPLE_FACTOR));

  let i0 = convert2DTo1D(downscaledResolution.x, p0);
  let i1 = convert2DTo1D(downscaledResolution.x, p1);
  let i2 = convert2DTo1D(downscaledResolution.x, p2);
  let i3 = convert2DTo1D(downscaledResolution.x, p3);

  let w0 = pixelBuffer[i0].weight;
  let w1 = pixelBuffer[i1].weight;
  let w2 = pixelBuffer[i2].weight;
  let w3 = pixelBuffer[i3].weight;

  let bottom = mix(w0, w1, t.x);
  let top = mix(w2, w3, t.x);
  return mix(bottom, top, t.y);
}

fn bilinearLightProbability(pixel: vec2<u32>, downscaledResolution: vec2<u32>) -> f32 {
  let p0 = pixel / DOWN_SAMPLE_FACTOR;
  let p1 = vec2<u32>(p0.x + 1, p0.y);
  let p2 = vec2<u32>(p0.x, p0.y + 1);
  let p3 = vec2<u32>(p0.x + 1, p0.y + 1);

  let t = fract(vec2<f32>(pixel) / vec2<f32>(DOWN_SAMPLE_FACTOR));

  let i0 = convert2DTo1D(downscaledResolution.x, p0);
  let i1 = convert2DTo1D(downscaledResolution.x, p1);
  let i2 = convert2DTo1D(downscaledResolution.x, p2);
  let i3 = convert2DTo1D(downscaledResolution.x, p3);

  let w0 = 1.0 / f32(pixelBuffer[i0].sampleCount);
  let w1 = 1.0 / f32(pixelBuffer[i1].sampleCount);
  let w2 = 1.0 / f32(pixelBuffer[i2].sampleCount);
  let w3 = 1.0 / f32(pixelBuffer[i3].sampleCount);

  let bottom = mix(w0, w1, t.x);
  let top = mix(w2, w3, t.x);
  return mix(bottom, top, t.y);
}

@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;

//  var blueNoisePixel = vec2<i32>(id.xy);
//  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
//  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
//  blueNoisePixel.x += frameOffsetX;
//  blueNoisePixel.y += frameOffsetY;
//  var r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy * DOWN_SAMPLE_FACTOR;

  var downscaledPixel = pixel / DOWN_SAMPLE_FACTOR;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let index = convert2DTo1D(downscaledResolution.x, downscaledPixel);

  var diffuse = vec3<f32>(0.0);
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;

  let lightIndex = pixelBuffer[index].lightIndex;

//  diffuse = bilinearLightContribution(pixel, downscaledResolution);
//  let finalWeightSum = bilinearReservoirWeight(pixel, downscaledResolution);
//  let lightPosition = bilinearLightPosition(pixel, downscaledResolution);

  diffuse = pixelBuffer[index].contribution;
  let finalWeightSum = pixelBuffer[index].weight;
  let sampleCount = pixelBuffer[index].sampleCount;
  let lightPosition = lightsBuffer[lightIndex].position;

  let lightProbability = 1.0 / f32(sampleCount);
  let lightDir = normalize(lightPosition - worldPos);
  let nDotL = dot(normalRef, lightDir);
//  diffuse *= nDotL;

  let viewDir = normalize(cameraPosition - worldPos);
  let halfDir = normalize(viewDir + lightDir);
  let specularStrength = 0.5;
  let shininess = 32.0;
  let specularIntensity = pow(max(dot(normalRef, halfDir), 0.0), shininess);
  let specular = specularStrength * specularIntensity * vec3<f32>(1.0);

  diffuse = diffuse * finalWeightSum * lightProbability;

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let outputColor = diffuse + inputColor + specular;

  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(diffuse, 1.0));
//    textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(finalWeightSum));


}