@group(0)
@binding(0)
var outputTex : texture_storage_2d<rgba8unorm, write>;

@compute
@workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) idx : vec3<u32>,
) {
  let uv = vec2<f32>(f32(idx.x) / f32(textureDimensions(outputTex).x), f32(idx.y) / f32(textureDimensions(outputTex).y));
  textureStore(outputTex, ivec2(idx.xy), vec4<f32>(uv, 0.0, 1.0));
}
