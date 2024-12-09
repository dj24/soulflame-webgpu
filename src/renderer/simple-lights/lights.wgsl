struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
  @location(1) @interpolate(flat) instanceId : u32,
}

struct Light {
  position: vec3<f32>,
  padding_1: f32,
  color: vec3<f32>,
  padding_2: f32,
  radius: f32,
};

@group(0) @binding(0) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var albedoTex : texture_2d<f32>;
@group(0) @binding(4) var linearSampler : sampler;


@vertex
fn vertex_main(
  @builtin(vertex_index) VertexIndex : u32,
  @builtin(instance_index) instanceId : u32
) -> VertexOutput {
  const pos = array(
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
  );

  const uv = array(
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
  );

  var output : VertexOutput;
  output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  output.instanceId = instanceId;
  return output;
}

@fragment
fn fragment_main(
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
  @location(1) @interpolate(flat) instanceId : u32,
) -> @location(0) vec4<f32>
{
  let light = lightsBuffer[instanceId];
  let worldPos = textureSampleLevel(worldPosTex, linearSampler, fragUV, 0).xyz;
  let normal = textureSampleLevel(normalTex, linearSampler, fragUV, 0).xyz;

  let lightDir = light.position - worldPos;
  let distance = length(lightDir);
  let attenuation = 1.0 / (1.0 + distance * distance);
  let lightColor = light.color * max(dot(normalize(normal), normalize(lightDir)), 0.0);

  return vec4<f32>(lightColor, attenuation);
}