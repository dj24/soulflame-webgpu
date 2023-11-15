@group(0) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : u32;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;

@compute @workgroup_size(1, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
) {
  var red = f32(WorkGroupID.x) / f32(resolution.x) + sin(f32(time)) * 0.000001;
  var green = f32(WorkGroupID.y) / f32(resolution.y);
  textureStore(outputTex, WorkGroupID.xy, vec4(red,green,0,1));
}
