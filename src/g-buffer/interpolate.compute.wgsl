@compute @workgroup_size(16, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let pixel = GlobalInvocationID.xy;
  let nearestPixel = vec2<u32>(floor(vec2<f32>(pixel) / 4.0) * 4.0);
}
