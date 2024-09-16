@group(0) @binding(0) var<storage, read_write> noiseField : array<f32>;
@group(0) @binding(1) var<storage, read_write> bitmasksCurrent : array<u32>;
@group(0) @binding(2) var<storage, read_write> bitmasksPrevious : array<u32>;

override volumeSize: u32 = 1;

fn convert3Dto1D(
  x : u32,
  y : u32,
  z : u32,
) -> u32 {
  return x + y * volumeSize + z * volumeSize * volumeSize;
}

@compute @workgroup_size(4, 4, 4)
fn fill(
 @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {

}

@compute @workgroup_size(4, 4, 4)
fn group(
 @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {

}