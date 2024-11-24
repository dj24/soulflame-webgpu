@compute @workgroup_size(8,8,1)
fn main(
    @builtin(global_invocation_id) idx : vec3<u32>,
) {
  let pixel00 = textureLoad(inputTex, idx.xy, 0);
  let pixel10 = textureLoad(inputTex, idx.xy + vec2(1, 0), 0);
  let pixel01 = textureLoad(inputTex, idx.xy + vec2(0, 1), 0);
  let pixel11 = textureLoad(inputTex, idx.xy + vec2(1, 1), 0);
  let avg = (pixel00 + pixel10 + pixel01 + pixel11) / 4;
  textureStore(outputTex, idx.xy / 2, avg);
}