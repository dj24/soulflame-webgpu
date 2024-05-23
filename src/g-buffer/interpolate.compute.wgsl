@group(0) @binding(0) var albedoTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var albedoCopyTex : texture_2d<f32>;

@compute @workgroup_size(16, 8, 1)
 fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let pixel = GlobalInvocationID.xy;
  let current = textureLoad(albedoCopyTex, pixel, 0);
  textureStore(albedoTex, pixel, current);
}