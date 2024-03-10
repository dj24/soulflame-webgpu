@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
@binding(1) @group(0) var<uniform> inverseModelViewProjectionMatrix : mat4x4f;

@fragment
fn main(
   @builtin(position) clipPos: vec4f,
   @location(0) worldPos : vec3f,
) -> @location(0) vec4f {
  return vec4f((worldPos.xyz % 1.0), 1.0);
}