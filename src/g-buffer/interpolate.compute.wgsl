
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let pixel = GlobalInvocationID.xy;
  textureStore(albedoTex, pixel, vec4(1,0,0,1));
}
