@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
@binding(1) @group(0) var<uniform> modelMatrix : mat4x4f;

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) objectPos : vec3f,
  @location(1) worldPos : vec3f,
  @location(2) @interpolate(linear) ndc : vec3f,
  @location(3) objectNormal : vec3f
}

// if vertex < 4 we are rendering an xy plane
// if vertex < 8 we are rendering an xz plane
// if vertex < 12 we are rendering an yz plane
@vertex
fn main(
  @location(0) vertexPos : vec4f,
  @builtin(instance_index) instanceIndex : u32,
  @builtin(vertex_index) vertexIndex : u32
) -> VertexOutput {
  var output : VertexOutput;
  var objectPos = vertexPos;
  var objectNormal = vec3f(0.0, 0.0, 0.0);
  if (vertexIndex < 4) {
    objectPos.z -= f32(instanceIndex);
    objectNormal = vec3f(0.0, 0.0, 1.0);
  } else if (vertexIndex < 8) {
    objectPos.y += f32(instanceIndex);
    objectNormal = vec3f(0.0, -1.0, 0.0);
  } else {
    objectPos.x += f32(instanceIndex);
    objectNormal = vec3f(1.0, 0.0, 0.0);
  }

  var clipPosition = modelViewProjectionMatrix * objectPos;
  output.position = clipPosition;
  output.worldPos = (modelMatrix * objectPos).xyz;
  output.objectPos = objectPos.xyz;
  output.ndc = clipPosition.xyz / clipPosition.w;
  output.ndc.y = -output.ndc.y;
  output.objectNormal = objectNormal;
  return output;
}
