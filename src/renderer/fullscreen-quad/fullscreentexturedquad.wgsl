@group(0) @binding(0) var mySampler : sampler;
@group(0) @binding(1) var myTexture : texture_2d<f32>;
//@group(0) @binding(2) var debugTexture : texture_2d<f32>;

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

fn get_debug_colour(index : i32) -> vec4<f32> {
  if(index < 0){
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let colours = array(
    vec4<f32>(1.0, 0.0, 0.0, 1.0),
    vec4<f32>(0.0, 1.0, 0.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 0.0, 1.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 1.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.0, 0.0, 0.0, 1.0),
  );
  return colours[index % 8];
}

@fragment
fn fragment_main(@location(0) fragUV : vec2<f32>) -> @location(0) vec4<f32> {
    let pixel = fragUV * vec2<f32>(textureDimensions(myTexture));
    var colour = textureLoad(myTexture, vec2<u32>(pixel),0);
    return colour;
//    return abs(colour) % 16.0 * 0.0625;
//    return colour.gggg * 0.5;
//    return (colour.rrrr * 500.0 % 1.0);
//    return get_debug_colour(i32(colour.a));
}
