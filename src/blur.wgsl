@group(0) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : u32;

@compute @workgroup_size(1, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
) {
  var xOffset = sin(f32(time) * 0.001) * 256 + 512;
  var yOffset = sin(f32(time) * 0.005) * 198 + 256;
  var red = sin(f32(time) * 0.01) * 0.5 + 0.5;
  var blue =sin(f32(time) * 0.02) * 0.5 + 0.5;
  var id = vec2<f32>(WorkGroupID.xy) + vec2(xOffset, yOffset);
  textureStore(outputTex, vec2<u32>(id), vec4(red,0,blue,1));
}
