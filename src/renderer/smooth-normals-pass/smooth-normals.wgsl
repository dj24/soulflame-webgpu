@compute @workgroup_size(8,8,1)
fn main(
    @builtin(global_invocation_id) idx : vec3<u32>,
) {
  let uv = vec2<f32>(idx.xy) / vec2<f32>(textureDimensions(outputTex));
  let inputSample = textureSampleLevel(inputTex, nearestSampler, uv, 0.0);
  textureStore(outputTex, idx.xy, vec4(1.0));
}