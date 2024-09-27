
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
  lightBoundaryDither: f32,
  lightCompositeDither: f32,
}


struct LightPixel {
  index: atomic<i32>,
  intensity: atomic<i32>,
  red: atomic<u32>,
  green: atomic<u32>,
  blue: atomic<u32>,
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
  let normal = textureLoad(normalTex, downscaledPixel, 0).xyz;

  var blueNoisePixel = vec2<i32>(id.xy);
  blueNoisePixel.x += i32(time.frame) * 32;
  blueNoisePixel.y += i32(time.frame) * 16;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;

  let light = lightsBuffer[lightIndex];
  let jitteredLightPosition = light.position + randomInUnitSphere(r);

  let lightDir = jitteredLightPosition - worldPos;
  let d = length(lightDir);

  // TODO: use distance from camera instead
  if(distance(cameraPosition, worldPos) > 10000.0){
    return;
  }

  let attenuation = 1.0 / (lightConfig.constantAttenuation + lightConfig.linearAttenuation * d + lightConfig.quadraticAttenuation * d * d);
  let intensity = i32(attenuation * length(light.color) * INTENSITY_ANTI_QUANTIZATION_FACTOR);

  let pixelBufferIndex = convert2DTo1D(downscaledResolution.x, pixel);
  let currentIntensity = atomicLoad(&pixelBuffer[pixelBufferIndex].intensity);
  let currentLightIndex = atomicLoad(&pixelBuffer[pixelBufferIndex].index);

  let NdotL = max(dot(normalize(normal), normalize(lightDir)), 0.0);

  atomicAdd(&pixelBuffer[pixelBufferIndex].red, u32(light.color.r * attenuation * INTENSITY_ANTI_QUANTIZATION_FACTOR * NdotL));
  atomicAdd(&pixelBuffer[pixelBufferIndex].green, u32(light.color.g * attenuation * INTENSITY_ANTI_QUANTIZATION_FACTOR * NdotL));
  atomicAdd(&pixelBuffer[pixelBufferIndex].blue, u32(light.color.b * attenuation * INTENSITY_ANTI_QUANTIZATION_FACTOR * NdotL));

  let jitter = i32((r.x * 2.0 - 1.0) * lightConfig.lightBoundaryDither);
  let offsetIntensity = intensity + jitter;

  if (currentIntensity < offsetIntensity) {
    atomicStore(&pixelBuffer[pixelBufferIndex].index, i32(lightIndex));
    atomicStore(&pixelBuffer[pixelBufferIndex].intensity, intensity);
  }
}

const AMBIENT_INTENSITY = 0.1;

@compute @workgroup_size(8,8,1)
fn shadows(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  let normal = textureLoad(normalTex, pixel * 4, 0).xyz;
  let worldPos = textureLoad(worldPosTex, pixel * 4, 0).xyz;

  if(distance(cameraPosition, worldPos) > 10000.0){
    return;
  }

  let pixelBufferIndex = convert2DTo1D(textureDimensions(outputTex).x / 4, pixel);
  let lightIndex = atomicLoad(&pixelBuffer[pixelBufferIndex].index);
  let light = lightsBuffer[lightIndex];


  var blueNoisePixel = vec2<i32>(id.xy);
  blueNoisePixel.x += i32(time.frame) * 32;
  blueNoisePixel.y += i32(time.frame) * 16;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;
  let jitteredLightPosition = light.position + randomInUnitSphere(r);
  let lightDir = normalize(jitteredLightPosition - worldPos);
  if(rayMarchBVH(worldPos + normal * 0.001, lightDir).hit){
    let currendRed = atomicLoad(&pixelBuffer[pixelBufferIndex].red);
    let currendGreen = atomicLoad(&pixelBuffer[pixelBufferIndex].green);
    let currendBlue = atomicLoad(&pixelBuffer[pixelBufferIndex].blue);
    atomicStore(&pixelBuffer[pixelBufferIndex].red, u32(f32(currendRed) * AMBIENT_INTENSITY));
    atomicStore(&pixelBuffer[pixelBufferIndex].green, u32(f32(currendGreen) * AMBIENT_INTENSITY));
    atomicStore(&pixelBuffer[pixelBufferIndex].blue, u32(f32(currendBlue) * AMBIENT_INTENSITY));
    return;
  }
}

@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  let normal = textureLoad(normalTex, pixel, 0).xyz;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;
  // TODO return early if we are out of bounds

  // Offset by a random value to avoid banding
  var blueNoisePixel = vec2<i32>(pixel);
  blueNoisePixel.x += i32(time.frame) * 32;
  blueNoisePixel.y += i32(time.frame) * 16;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;
  let offsetPixel = pixel + vec2<u32>((r * 2.0 - vec2(1.0)) * lightConfig.lightCompositeDither);


  let dotProduct = dot(normal, textureLoad(normalTex, vec2<u32>(pixel * 4), 0).xyz);
  let worldDistance = distance(worldPos, textureLoad(worldPosTex, vec2<u32>(pixel * 4), 0).xyz);
  var bestWeight = dotProduct / worldDistance;


  // Find best normal sample from the surrounding pixels in the light intensity buffer
  var bestDownscaledPixel = offsetPixel / 4;
  for(var x = -1; x <= 1; x++){
    for(var y = -1; y <= 1; y++){
      let currentPixel = vec2<u32>(vec2<i32>(offsetPixel / 4) + vec2<i32>(x,y));
      if(any(currentPixel < vec2(0)) || any(currentPixel >= textureDimensions(outputTex) / 4)){
        continue;
      }

      let centerOfGroup = vec2<u32>(currentPixel * 4) + vec2(0);
      let currentNormal = textureLoad(normalTex, centerOfGroup, 0).xyz;
      let currentWorldPos = textureLoad(worldPosTex, centerOfGroup, 0).xyz;

      let weight = dot(normal, currentNormal) / exp(distance(worldPos, currentWorldPos));
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
  let lightDir = normalize(light.position - worldPos);
  var NdotL = max(dot(normalize(normal), lightDir), 0.0);

  // Check for shadow
//  if(rayMarchBVH(worldPos + normal * 0.01, lightDir).hit){
//    textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(0.0));
//    return;
//  }

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;

  let red = f32(atomicLoad(&pixelBuffer[index].red)) / INTENSITY_ANTI_QUANTIZATION_FACTOR;
  let green = f32(atomicLoad(&pixelBuffer[index].green)) / INTENSITY_ANTI_QUANTIZATION_FACTOR;
  let blue = f32(atomicLoad(&pixelBuffer[index].blue)) / INTENSITY_ANTI_QUANTIZATION_FACTOR;
  let outputColor = vec3(red, green, blue) + inputColor * NdotL;

  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(outputColor, 1.0));

}