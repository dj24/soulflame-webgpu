struct Light {
  position: vec3<f32>,
  padding_1: f32,
  color: vec3<f32>,
  padding_2: f32,
  radius: f32,
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
  index: atomic<u32>,
  intensity: atomic<u32>,
}

@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<atomic<u32>>;


@compute @workgroup_size(1, 1, 64)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>,
    @builtin(workgroup_id) workgroupId : vec3<u32>,
) {
  let worldPos = textureLoad(worldPosTex, vec2<i32>(workgroupId.xy), 0).xyz;
  let lightIndex = id.z;
  if(length(worldPos) > 9999.9){
    return;
  }
  let normal = textureLoad(normalTex, vec2<i32>(workgroupId.xy), 0).xyz;
  let light = lightsBuffer[3];
  let lightDir = light.position - worldPos;
  let distance = length(lightDir);
  let attenuation = 1.0 / (1.0 + distance * distance / (light.radius * light.radius));
  let lightColor = light.color * attenuation;
  let NdotL = max(dot(normalize(normal), normalize(lightDir)), 0.0);
  let lightIntensity = NdotL * 0.5 + 0.5;
  let finalColor = lightColor * lightIntensity;

  let pixelBufferIndex = convert2DTo1D(1024, vec2<u32>(workgroupId.xy));
  let currentLightIndex = atomicLoad(&pixelBuffer[pixelBufferIndex]);

  // TODO: compare intensities and update the pixel buffer if the new light is brighter

  atomicStore(&pixelBuffer[pixelBufferIndex], 0u);
}


@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  let resolution = textureDimensions(outputTex);
  let index = convert2DTo1D(resolution.x, pixel);
  let lightIndex =  atomicLoad(&pixelBuffer[index]);
  let light = lightsBuffer[lightIndex];
  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(light.color * 0.002, 1.0));
}