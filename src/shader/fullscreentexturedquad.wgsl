@group(0) @binding(0) var mySampler : sampler;
@group(0) @binding(1) var myTexture : texture_2d<f32>;
@group(0) @binding(2) var albedoTexture : texture_2d<f32>;
@group(0) @binding(3) var normalTexture : texture_2d<f32>;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
}

@vertex
fn vertex_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
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
  return output;
}

@fragment
fn fragment_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
    let normal = textureSample(normalTexture, mySampler, fragUV);
    let albedo = textureSample(albedoTexture, mySampler, fragUV);
    let foo = textureSample(myTexture, mySampler, fragUV);
    if(fragUV.x < 0.33) {
        return albedo;
    }
    if(fragUV.x < 0.66) {
        return normal;
    }
    return foo;
}
