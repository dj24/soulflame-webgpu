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
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(1) var nearestSampler : sampler;
@group(0) @binding(2) var worldPosTex : texture_2d<f32>;
@group(0) @binding(3) var normalTex : texture_2d<f32>;
@group(0) @binding(5) var<uniform> viewProjections : ViewProjectionMatrices;

const constantAttenuation = 0.0;
const linearAttenuation = 0.0;
const quadraticAttenuation = 2.0;

fn getCameraPosition(invViewProjection: mat4x4<f32>) -> vec3<f32> {
  return invViewProjection[3].xyz;
}

@fragment
fn main(
    @location(0) @interpolate(linear) lightVolumeNdc : vec3f,
    @location(1) lightPosition : vec3f,
    @location(2) lightColor : vec3f,
) -> @location(0) vec4f {
  var screenUV = lightVolumeNdc.xy * 0.5 + 0.5;
  let normal = textureSampleLevel(normalTex, nearestSampler, screenUV, 0.0).xyz;
  var worldPos = textureSampleLevel(worldPosTex, nearestSampler, screenUV, 0.0).xyz;
  let cameraPos = getCameraPosition(viewProjections.inverseViewProjection);
  let lightDirection = normalize(lightPosition - worldPos);
  let distanceToLight = length(lightPosition - worldPos);
  let attenuation = 1.0 / (constantAttenuation + linearAttenuation * distanceToLight + quadraticAttenuation * distanceToLight * distanceToLight);
  let nDotL = max(dot(normal, lightDirection), 0.0);
  let diffuse = nDotL * lightColor;
  return vec4(diffuse, attenuation);
}