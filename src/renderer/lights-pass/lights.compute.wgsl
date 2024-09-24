
struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
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
}


struct LightPixel {
  index: atomic<i32>,
  intensity: atomic<i32>,
}

@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<LightPixel>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;

@group(1) @binding(0) var<uniform> lightConfig : LightConfig;

const INTENSITY_ANTI_QUANTIZATION_FACTOR = 10000.0;
const CONSTANT_ATTENUATION = 0.0;
const LINEAR_ATTENUATION = 0.1;
const QUADRATIC_ATTENUATION = 0.1;

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>,
    @builtin(workgroup_id) workgroupId : vec3<u32>,
) {

  let pixel = id.xy;
  let lightIndex = workgroupId.z;
  let downscaledPixel = vec2<u32>(id.xy) * 4;
  let downscaledResolution = textureDimensions(outputTex) / 4;
  let worldPos = textureLoad(worldPosTex, downscaledPixel, 0).xyz;

  let light = lightsBuffer[lightIndex];
  let lightDir = light.position - worldPos;
  let distance = length(lightDir);

  if(distance > 10000.0){
    return;
  }

  let attenuation = 1.0 / (lightConfig.constantAttenuation + lightConfig.linearAttenuation * distance + lightConfig.quadraticAttenuation * distance * distance);
  let intensity = i32(attenuation * length(light.color) * INTENSITY_ANTI_QUANTIZATION_FACTOR);

  let pixelBufferIndex = convert2DTo1D(downscaledResolution.x, pixel);
  let currentIntensity = atomicLoad(&pixelBuffer[pixelBufferIndex].intensity);
  let currentLightIndex = atomicLoad(&pixelBuffer[pixelBufferIndex].index);
  if(currentIntensity < intensity){
    atomicStore(&pixelBuffer[pixelBufferIndex].index, i32(lightIndex)); // TODO: find why this breaks things
    atomicStore(&pixelBuffer[pixelBufferIndex].intensity, intensity);
  }
}


@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  let normal = textureLoad(normalTex, pixel, 0).xyz;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;

  // Find best normal sample from the surrounding pixels in the light intensity buffer
  var bestDownscaledPixel = id.xy / 4;
  let dotProduct = dot(normal, textureLoad(normalTex, vec2<u32>(bestDownscaledPixel * 4), 0).xyz);
  let worldDistance = distance(worldPos, textureLoad(worldPosTex, vec2<u32>(bestDownscaledPixel * 4), 0).xyz);
  var bestWeight = dotProduct / worldDistance;

  for(var x = -1; x <= 1; x++){
    for(var y = -1; y <= 1; y++){
      let currentPixel = vec2<u32>(vec2<i32>(id.xy / 4) + vec2(x, y));
      if(any(currentPixel < vec2(0)) || any(currentPixel >= textureDimensions(outputTex) / 4)){
        continue;
      }
      let centerOfGroup = vec2<u32>(currentPixel * 4) + vec2(0);
      let currentNormal = textureLoad(normalTex, centerOfGroup, 0).xyz;
      let currentWorldPos = textureLoad(worldPosTex, centerOfGroup, 0).xyz;

      let weight = dot(normal, currentNormal) / distance(worldPos, currentWorldPos);
      if(weight > bestWeight){
        bestWeight = weight;
        bestDownscaledPixel = currentPixel;
      }
    }
  }

  let downscaledResolution = textureDimensions(outputTex) / 4;
  let index = convert2DTo1D(downscaledResolution.x, bestDownscaledPixel);
  let lightIndex =  atomicLoad(&pixelBuffer[index].index);
  let intensity = f32(atomicLoad(&pixelBuffer[index].intensity)) / INTENSITY_ANTI_QUANTIZATION_FACTOR;
  let light = lightsBuffer[lightIndex];

  // Simple Lambertian lighting
  let lightDir = light.position - worldPos;
  var NdotL = max(dot(normalize(normal), normalize(lightDir)), 0.0);

  let rayDir = normalize(lightDir);
  if(rayMarchBVH(worldPos, rayDir).hit){
    return;
  }

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let outputColor = intensity * normalize(light.color) * NdotL + inputColor;
  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(outputColor, 1.0));
}