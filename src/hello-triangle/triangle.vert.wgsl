@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
@binding(1) @group(0) var<uniform> inverseModelViewProjectionMatrix : mat4x4f;

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) worldPos : vec3f,
}

@vertex
fn main(
  @location(0) position : vec4f,
) -> VertexOutput {
  var output : VertexOutput;
  var vertex = modelViewProjectionMatrix * position;
  output.position = vertex;
  output.worldPos = position.xyz;
  return output;
}
