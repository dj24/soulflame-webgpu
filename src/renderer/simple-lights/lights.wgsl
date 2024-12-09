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
};

@group(0) @binding(0) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var albedoTex : texture_2d<f32>;
@group(0) @binding(4) var linearSampler : sampler;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;

fn random(co : vec2<f32>) -> f32 {
    return fract(sin(dot(co, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn randomFloat3(co : vec2<f32>) -> vec3<f32> {
    return vec3<f32>(random(co), random(co * 2.0), random(co * 3.0));
}

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
  let albedo = textureSampleLevel(albedoTex, linearSampler, fragUV, 0).xyz;

  // Area Light
  var totalAttenuation = 0.0;
  for(var i = 0; i < 8; i = i + 1) {
    let randomOffset = randomFloat3(fragUV + vec2<f32>(f32(i) * 0.01, 0.0));
    let lightPos = light.position + (randomOffset * 2.0 - 1.0);
    let lightDir = lightPos - worldPos;
    let distance = length(lightDir);

    var attenuation = 1.0 / (1.0 + distance * distance);
    attenuation*= max(dot(normalize(normal), normalize(lightDir)), 0.0);

    totalAttenuation += attenuation;
  }
  totalAttenuation /= 8.0;
  totalAttenuation *= length(light.color);

  return vec4<f32>(albedo * normalize(light.color), totalAttenuation);
}