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
  var clipPosition = modelViewProjectionMatrix * objectPos;
  output.position = clipPosition;
//  output.worldPos = (modelMatrix * objectPos).xyz;
  output.worldPos = objectPos.xyz;
  output.ndc = clipPosition.xyz / clipPosition.w;
  output.ndc.y = -output.ndc.y;
  return output;
}
