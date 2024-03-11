@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
@binding(1) @group(0) var<uniform> modelMatrix : mat4x4f;

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) worldPos : vec3f,
  @location(1) @interpolate(linear) ndc : vec3f,
}

@vertex
fn main(
  @location(0) objectPos : vec4f,
) -> VertexOutput {
  var output : VertexOutput;
  var vertex = modelViewProjectionMatrix * objectPos;
  output.position = vertex;
  output.worldPos = (modelMatrix * objectPos).xyz;
  output.ndc = vertex.xyz / vertex.w;
  return output;
}
