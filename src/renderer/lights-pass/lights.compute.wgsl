struct Light {
  position: vec3<f32>,
  padding_1: f32,
  color: vec3<f32>,
};

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

struct LightPixel {
  index: atomic<i32>,
  intensity: atomic<i32>,
}

@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<LightPixel>;


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

  let attenuation = 1.0 / (1.0 + 0.05 * distance + 0.02 * distance * distance);
  let intensity = i32(attenuation * length(light.color));

  let pixelBufferIndex = convert2DTo1D(downscaledResolution.x, pixel);
  let currentIntensity = atomicLoad(&pixelBuffer[pixelBufferIndex].intensity);
  let currentLightIndex = atomicLoad(&pixelBuffer[pixelBufferIndex].index);
  if(currentIntensity < intensity){
//    atomicStore(&pixelBuffer[pixelBufferIndex].index, i32(lightIndex)); // TODO: find why this breaks things
    atomicStore(&pixelBuffer[pixelBufferIndex].intensity, intensity);
  }
}


@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  let downscaledPixel = id.xy / 4;
  let downscaledResolution = textureDimensions(outputTex) / 4;
  let index = convert2DTo1D(downscaledResolution.x, downscaledPixel);
  let lightIndex =  atomicLoad(&pixelBuffer[index].index);
  let intensity = f32(atomicLoad(&pixelBuffer[index].intensity));
  let light = lightsBuffer[lightIndex];

  let normal = textureLoad(normalTex, pixel, 0).xyz;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;

  let lightDir = light.position - worldPos;
  let NdotL = max(dot(normalize(normal), normalize(lightDir)), 0.0);


  let outputColor = intensity * normalize(light.color) * NdotL;
  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(outputColor, 1.0));
}