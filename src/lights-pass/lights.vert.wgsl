@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;

struct VertexOutput {
  @builtin(position) position : vec4f,
}

@vertex
fn main(
  @location(0) objectPos : vec4f,
) -> VertexOutput {
  var output : VertexOutput;
  output.position =modelViewProjectionMatrix * objectPos;
  return output;
}
