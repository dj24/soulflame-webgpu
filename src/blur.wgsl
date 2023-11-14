@group(0) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : u32;

@compute @workgroup_size(1, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
) {
  var offset = sin(f32(time) * 0.001) * 256 + 256;
  var red = sin(f32(time) * 0.001) * 0.5 + 0.5;
  var blue = 1 - red;
  var id = vec2<f32>(WorkGroupID.xy) + vec2(offset, 0);
  textureStore(outputTex, vec2<u32>(id), vec4(red,0,blue,1));
}
